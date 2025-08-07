#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const success = (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`);
const error = (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`);
const info = (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
const warn = (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

async function clearConversationHistory(phoneNumber: string, resetLead: boolean = false) {
  try {
    // Validate Supabase connection
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Normalize phone number (remove all non-digits)
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    console.log(`\n${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}  Clearing Data for: ${phoneNumber}${colors.reset}`);
    console.log(`${colors.cyan}  Normalized: ${normalizedPhone}${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

    // Step 1: Find the lead
    info('Finding lead record...');
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('phone_number_normalized', normalizedPhone);

    if (leadError) throw leadError;

    if (!leads || leads.length === 0) {
      warn('No lead found with this phone number');
      return false;
    }

    const lead = leads[0];
    success(`Found lead: ${lead.customer_name || 'Unknown'} (ID: ${lead.id})`);

    // Step 2: Show current data stats
    console.log(`\n${colors.magenta}Current Data:${colors.reset}`);
    
    // Count conversations
    const { count: convCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id);
    info(`Conversations: ${convCount || 0}`);

    // Count summaries
    const { count: summaryCount } = await supabase
      .from('conversation_summaries')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id);
    info(`Conversation summaries: ${summaryCount || 0}`);

    // Count call sessions
    const { count: sessionCount } = await supabase
      .from('call_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id);
    info(`Call sessions: ${sessionCount || 0}`);

    // Step 3: Delete conversations
    console.log(`\n${colors.yellow}Deleting data...${colors.reset}`);
    
    // Delete conversations
    const { error: convDeleteError, count: deletedConv } = await supabase
      .from('conversations')
      .delete()
      .eq('lead_id', lead.id)
      .select('*', { count: 'exact' });

    if (convDeleteError) {
      error(`Failed to delete conversations: ${convDeleteError.message}`);
    } else {
      success(`Deleted ${deletedConv || 0} conversations`);
    }

    // Delete conversation summaries
    const { error: summaryDeleteError, count: deletedSummaries } = await supabase
      .from('conversation_summaries')
      .delete()
      .eq('lead_id', lead.id)
      .select('*', { count: 'exact' });

    if (summaryDeleteError) {
      error(`Failed to delete summaries: ${summaryDeleteError.message}`);
    } else {
      success(`Deleted ${deletedSummaries || 0} conversation summaries`);
    }

    // Delete call sessions
    const { error: sessionDeleteError, count: deletedSessions } = await supabase
      .from('call_sessions')
      .delete()
      .eq('lead_id', lead.id)
      .select('*', { count: 'exact' });

    if (sessionDeleteError) {
      error(`Failed to delete call sessions: ${sessionDeleteError.message}`);
    } else {
      success(`Deleted ${deletedSessions || 0} call sessions`);
    }

    // Step 4: Reset lead if requested
    if (resetLead) {
      console.log(`\n${colors.yellow}Resetting lead data...${colors.reset}`);
      
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          customer_name: null,
          status: 'new',
          sentiment: 'neutral',
          bike_interest: {},
          qualification_data: {
            ready_to_buy: false,
            contact_preference: 'phone'
          },
          last_contact_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (updateError) {
        error(`Failed to reset lead: ${updateError.message}`);
      } else {
        success('Lead data reset to initial state');
      }
    } else {
      info('Lead data preserved (use --reset-lead to clear)');
    }

    console.log(`\n${colors.green}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}  ✅ Cleanup Complete!${colors.reset}`);
    console.log(`${colors.green}═══════════════════════════════════════════${colors.reset}\n`);

    return true;
  } catch (err: any) {
    error(`Operation failed: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   BICI Test Data Cleanup Tool              ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log('\nThis tool will clear all conversation history for a test phone number.\n');

  // Get phone number from command line or ask
  let phoneNumber = process.argv[2];
  const resetLead = process.argv.includes('--reset-lead') || process.argv.includes('-r');
  
  if (!phoneNumber) {
    phoneNumber = await askQuestion(`${colors.yellow}Enter phone number to clear (or press Enter for default +16049085474): ${colors.reset}`);
    
    if (!phoneNumber) {
      phoneNumber = '+16049085474';
      info(`Using default test number: ${phoneNumber}`);
    }
  }

  // Normalize the phone number
  if (!phoneNumber.startsWith('+')) {
    phoneNumber = '+' + phoneNumber;
  }

  // Safety confirmation
  console.log(`\n${colors.red}⚠️  WARNING ⚠️${colors.reset}`);
  console.log(`This will ${colors.red}permanently delete${colors.reset} all conversation data for ${colors.yellow}${phoneNumber}${colors.reset}`);
  
  if (resetLead) {
    console.log(`It will also ${colors.red}reset the lead${colors.reset} to initial state (clear name, status, etc.)`);
  }
  
  const confirm = await askQuestion(`\nType '${colors.green}yes${colors.reset}' to continue, or anything else to cancel: `);
  
  if (confirm.toLowerCase() !== 'yes') {
    warn('Operation cancelled');
    rl.close();
    process.exit(0);
  }

  // Execute cleanup
  const success = await clearConversationHistory(phoneNumber, resetLead);
  
  rl.close();
  process.exit(success ? 0 : 1);
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n');
  warn('Operation cancelled by user');
  rl.close();
  process.exit(0);
});

// Run the script
main().catch(err => {
  error(`Unexpected error: ${err.message}`);
  rl.close();
  process.exit(1);
});