import { Response } from 'express';
import { logger } from '../utils/logger';
import { redisService } from './redis.service';

// Store SSE connections
const sseConnections = new Map<string, Response[]>();

export function setupSSEConnection(clientId: string, res: Response) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Store connection
  if (!sseConnections.has(clientId)) {
    sseConnections.set(clientId, []);
  }
  sseConnections.get(clientId)!.push(res);
  
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    clientId,
    timestamp: new Date().toISOString() 
  })}\n\n`);
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);
  
  // Clean up on disconnect
  res.on('close', () => {
    clearInterval(keepAlive);
    const connections = sseConnections.get(clientId);
    if (connections) {
      const index = connections.indexOf(res);
      if (index > -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        sseConnections.delete(clientId);
      }
    }
    logger.info('SSE connection closed:', { clientId });
  });
  
  logger.info('SSE connection established:', { clientId });
}

export function broadcastToClients(data: any, targetClientId?: string) {
  const message = `data: ${JSON.stringify({
    ...data,
    timestamp: new Date().toISOString()
  })}\n\n`;
  
  if (targetClientId) {
    // Send to specific client
    const connections = sseConnections.get(targetClientId);
    if (connections) {
      connections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          logger.error('Error broadcasting to client:', error);
        }
      });
    }
  } else {
    // Broadcast to all clients
    sseConnections.forEach((connections, clientId) => {
      connections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          logger.error('Error broadcasting to client:', error);
        }
      });
    });
  }
  
  logger.debug('Broadcasted event:', { 
    type: data.type, 
    targetClientId,
    connectionCount: sseConnections.size 
  });
}

export function getActiveConnections(): number {
  let total = 0;
  sseConnections.forEach(connections => {
    total += connections.length;
  });
  return total;
}

// Dashboard caching functions to improve performance
/**
 * Broadcast lead update and invalidate related caches
 */
export function broadcastLeadUpdate(leadId: string, updateData?: any) {
  // Standard broadcast
  broadcastToClients({
    type: 'lead_updated',
    lead_id: leadId,
    ...updateData
  });
  
  // Invalidate dashboard caches that might be affected
  // This is fire-and-forget to not slow down the broadcast
  setImmediate(async () => {
    try {
      // We don't have organization ID here, so we'll need to clear broadly
      // or find a way to get it from the lead data
      if (updateData?.organization_id) {
        await redisService.invalidateDashboardCache(updateData.organization_id);
      }
    } catch (error) {
      logger.error('Error invalidating dashboard cache after lead update:', error);
    }
  });
}

/**
 * Get cached dashboard statistics or fetch from database
 */
export async function getCachedDashboardStats(organizationId: string): Promise<any | null> {
  try {
    // Try cache first
    const cached = await redisService.getCachedDashboardStats(organizationId);
    if (cached) {
      logger.debug('Dashboard stats cache hit for org:', organizationId);
      return cached;
    }

    // Cache miss - fetch from database
    const stats = await fetchDashboardStatsFromDB(organizationId);
    
    // Cache the results
    if (stats) {
      await redisService.cacheDashboardStats(organizationId, stats);
    }
    
    return stats;
  } catch (error) {
    logger.error('Error getting cached dashboard stats:', error);
    // Fall back to direct database fetch
    return await fetchDashboardStatsFromDB(organizationId);
  }
}

/**
 * Get cached leads list or fetch from database
 */
export async function getCachedDashboardLeads(organizationId: string): Promise<any[] | null> {
  try {
    // Try cache first
    const cached = await redisService.getCachedDashboardLeads(organizationId);
    if (cached) {
      logger.debug('Dashboard leads cache hit for org:', organizationId);
      return cached;
    }

    // Cache miss - fetch from database
    const leads = await fetchLeadsFromDB(organizationId);
    
    // Cache the results
    if (leads) {
      await redisService.cacheDashboardLeads(organizationId, leads);
    }
    
    return leads;
  } catch (error) {
    logger.error('Error getting cached dashboard leads:', error);
    // Fall back to direct database fetch
    return await fetchLeadsFromDB(organizationId);
  }
}

/**
 * Invalidate dashboard caches when data changes
 */
export async function invalidateDashboardCache(organizationId: string) {
  try {
    await redisService.invalidateDashboardCache(organizationId);
    logger.debug('Invalidated dashboard cache for org:', organizationId);
  } catch (error) {
    logger.error('Error invalidating dashboard cache:', error);
  }
}

/**
 * Helper to fetch dashboard stats from database
 */
async function fetchDashboardStatsFromDB(organizationId: string): Promise<any> {
  try {
    const { supabase } = await import('../config/supabase.config');
    const { HumanControlService } = await import('./humanControl.service');
    const { CallSessionService } = await import('./callSession.service');
    
    const humanControlService = new HumanControlService();
    const callSessionService = new CallSessionService();
    
    // Clean up stale sessions first
    await callSessionService.cleanupStaleSessions(organizationId);
    
    // Get counts
    const [leads, calls, conversations, activeCalls] = await Promise.all([
      supabase.from('leads').select('count').eq('organization_id', organizationId),
      supabase.from('call_sessions').select('count').eq('organization_id', organizationId),
      supabase.from('conversations').select('count').eq('organization_id', organizationId),
      supabase.from('call_sessions')
        .select('count')
        .eq('organization_id', organizationId)
        .in('status', ['initiated', 'active'])
    ]);
    
    // Count both human control sessions and active calls
    const humanSessions = (await humanControlService.getActiveSessions()).length;
    const activeCallSessions = activeCalls.data?.[0]?.count || 0;
    
    return {
      total_leads: leads.data?.[0]?.count || 0,
      total_calls: calls.data?.[0]?.count || 0,
      total_conversations: conversations.data?.[0]?.count || 0,
      active_sessions: humanSessions + activeCallSessions
    };
  } catch (error) {
    logger.error('Error fetching dashboard stats from database:', error);
    return null;
  }
}

/**
 * Helper to fetch leads from database
 */
async function fetchLeadsFromDB(organizationId: string): Promise<any[]> {
  try {
    const { supabase } = await import('../config/supabase.config');
    
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    logger.error('Error fetching leads from database:', error);
    return [];
  }
}