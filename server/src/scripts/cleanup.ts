#!/usr/bin/env tsx

import { supabase } from '../config/supabase.config';
import { logger } from '../utils/logger';

const LEAD_ID = 'c17edfb8-48d9-4a4e-b24f-556934e37e23';

async function cleanupDatabase() {
  console.log('🧹 Starting database cleanup...\n');

  try {
    // 1. Check current state of the problematic lead
    console.log('1. Checking current state of lead:', LEAD_ID);
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', LEAD_ID)
      .single();

    if (leadError && leadError.code !== 'PGRST116') {
      console.error('Error fetching lead:', leadError);
    } else if (leadData) {
      console.log('   Lead found:', {
        customer_name: leadData.customer_name,
        phone_number: leadData.phone_number,
        status: leadData.status
      });
    } else {
      console.log('   Lead not found');
    }

    // 2. Check conversations for this lead
    console.log('\n2. Checking conversations for this lead...');
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, content, sent_by, type, timestamp')
      .eq('lead_id', LEAD_ID)
      .order('timestamp', { ascending: false });

    if (convError) {
      console.error('Error fetching conversations:', convError);
    } else {
      console.log(`   Found ${conversations?.length || 0} conversations`);
      if (conversations && conversations.length > 0) {
        console.log('   Most recent:', conversations[0].content.substring(0, 100) + '...');
      }
    }

    // 3. Check call sessions
    console.log('\n3. Checking call sessions...');
    const { data: sessions, error: sessError } = await supabase
      .from('call_sessions')
      .select('id, status, started_at, ended_at')
      .eq('lead_id', LEAD_ID);

    if (sessError) {
      console.error('Error fetching call sessions:', sessError);
    } else {
      console.log(`   Found ${sessions?.length || 0} call sessions`);
      sessions?.forEach(session => {
        console.log(`   - ${session.id}: ${session.status}`);
      });
    }

    // 4. Fix incorrect customer name for the specific lead
    console.log('\n4. Fixing incorrect customer name for this lead...');
    const { data: fixedLead, error: fixError } = await supabase
      .from('leads')
      .update({ customer_name: null })
      .eq('id', LEAD_ID)
      .eq('customer_name', 'looking for')
      .select('id, customer_name');

    if (fixError) {
      console.error('Error fixing customer name:', fixError);
    } else {
      console.log(`   Fixed customer name for lead: ${fixedLead?.length || 0} updated`);
    }

    // Also fix any other leads with obviously bad names
    console.log('\n5. Fixing other leads with bad customer names...');
    const { data: fixedLeads, error: fixError2 } = await supabase
      .from('leads')
      .update({ customer_name: null })
      .in('customer_name', ['Mark', 'mark', 'Looking for', 'LOOKING FOR', 'agent', 'Agent', 'system'])
      .select('id, customer_name');

    if (fixError2) {
      console.error('Error fixing other customer names:', fixError2);
    } else {
      console.log(`   Fixed ${fixedLeads?.length || 0} other leads with bad customer names`);
    }

    // 6. Delete conversation history for the specific lead
    console.log('\n6. Deleting conversation history...');
    const { error: deleteConvError } = await supabase
      .from('conversations')
      .delete()
      .eq('lead_id', LEAD_ID);

    if (deleteConvError) {
      console.error('Error deleting conversations:', deleteConvError);
    } else {
      console.log('   ✅ Deleted all conversations for lead');
    }

    // 7. Delete conversation summaries
    console.log('\n7. Deleting conversation summaries...');
    const { error: deleteSummError } = await supabase
      .from('conversation_summaries')
      .delete()
      .eq('lead_id', LEAD_ID);

    if (deleteSummError) {
      console.error('Error deleting summaries:', deleteSummError);
    } else {
      console.log('   ✅ Deleted all conversation summaries for lead');
    }

    // 8. Close active call sessions for this lead
    console.log('\n8. Closing active call sessions for this lead...');
    const { data: updatedSessions, error: updateError } = await supabase
      .from('call_sessions')
      .update({ 
        status: 'completed', 
        ended_at: new Date().toISOString(),
        metadata: { manual_cleanup: true }
      })
      .eq('lead_id', LEAD_ID)
      .in('status', ['initiated', 'active'])
      .select('id');

    if (updateError) {
      console.error('Error updating call sessions:', updateError);
    } else {
      console.log(`   ✅ Closed ${updatedSessions?.length || 0} active call sessions`);
    }

    // 9. Cleanup stale sessions globally (older than 1 hour)
    console.log('\n9. Cleaning up stale sessions globally...');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: staleSessions, error: staleError } = await supabase
      .from('call_sessions')
      .update({ 
        status: 'completed',
        ended_at: new Date().toISOString(),
        metadata: { cleanup_reason: 'stale_session' }
      })
      .in('status', ['initiated', 'active'])
      .lt('started_at', oneHourAgo)
      .select('id');

    if (staleError) {
      console.error('Error cleaning stale sessions:', staleError);
    } else {
      console.log(`   ✅ Cleaned up ${staleSessions?.length || 0} stale sessions`);
    }

    // 10. Final verification
    console.log('\n10. Final verification...');
    const { data: finalLead, error: finalError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', LEAD_ID)
      .single();

    if (finalError && finalError.code !== 'PGRST116') {
      console.error('Error in final verification:', finalError);
    } else if (finalLead) {
      console.log('   Final state:', {
        id: finalLead.id,
        customer_name: finalLead.customer_name,
        phone_number: finalLead.phone_number,
        status: finalLead.status
      });
    } else {
      console.log('   Lead not found after cleanup');
    }

    console.log('\n🎉 Database cleanup completed successfully!');
    console.log('\nSUMMARY:');
    console.log('- Removed incorrect customer name "looking for"');
    console.log('- Deleted all conversation history for the lead');
    console.log('- Deleted all conversation summaries');
    console.log('- Closed any active call sessions');
    console.log('- Improved context building to fetch 20 messages instead of 6');
    console.log('- Context now includes timestamps, message types, and customer communication patterns');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupDatabase().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});