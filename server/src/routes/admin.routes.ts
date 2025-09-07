import { Express, Request, Response } from 'express';
import { HumanControlService } from '../services/humanControl.service';
import { CallSessionService } from '../services/callSession.service';
import { logger } from '../utils/logger';

const humanControlService = new HumanControlService();
const callSessionService = new CallSessionService();

export function setupAdminRoutes(app: Express) {
  // Clear all active sessions (for debugging/admin use)
  app.post('/api/admin/clear-sessions', async (req: Request, res: Response) => {
    try {
      const organizationId = req.headers['x-organization-id'] as string || 'b0c1b1c1-0000-0000-0000-000000000001';
      
      // Clear human control sessions from memory
      const activeSessions = await humanControlService.getActiveSessions();
      for (const session of activeSessions) {
        await humanControlService.leaveConversation(session.lead_id);
      }
      
      // Clear stale call sessions from database
      await callSessionService.cleanupStaleSessions(organizationId);
      
      // Also update any hanging sessions in database
      const { supabase } = await import('../config/supabase.config');
      
      // End all human control sessions
      await supabase
        .from('human_control_sessions')
        .update({ ended_at: new Date() })
        .is('ended_at', null);
      
      // Mark all active call sessions as completed
      await supabase
        .from('call_sessions')
        .update({ 
          status: 'completed',
          ended_at: new Date()
        })
        .in('status', ['initiated', 'active']);
      
      logger.info('Cleared all active sessions');
      
      res.json({ 
        success: true, 
        message: 'All sessions cleared',
        cleared: {
          human_control: activeSessions.length,
          database_updated: true
        }
      });
    } catch (error) {
      logger.error('Error clearing sessions:', error);
      res.status(500).json({ error: 'Failed to clear sessions' });
    }
  });
  
  // Force clear a specific lead's sessions
  app.post('/api/admin/clear-lead-sessions/:leadId', async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      
      // Try to leave human control if active
      try {
        await humanControlService.leaveConversation(leadId);
      } catch (e) {
        // Session might not exist, that's ok
      }
      
      // Clear from database
      const { supabase } = await import('../config/supabase.config');
      
      await supabase
        .from('human_control_sessions')
        .update({ ended_at: new Date() })
        .eq('lead_id', leadId)
        .is('ended_at', null);
      
      await supabase
        .from('call_sessions')
        .update({ 
          status: 'completed',
          ended_at: new Date()
        })
        .eq('lead_id', leadId)
        .in('status', ['initiated', 'active']);
      
      res.json({ success: true, message: `Sessions cleared for lead ${leadId}` });
    } catch (error) {
      logger.error('Error clearing lead sessions:', error);
      res.status(500).json({ error: 'Failed to clear lead sessions' });
    }
  });
}