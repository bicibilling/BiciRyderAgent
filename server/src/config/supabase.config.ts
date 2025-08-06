import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  logger.error('Missing Supabase configuration');
  throw new Error('Supabase configuration is required');
}

// Create Supabase client with service role key for admin operations
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper function to handle Supabase errors
export function handleSupabaseError(error: any, context: string) {
  logger.error(`Supabase error in ${context}:`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  });
  
  throw new Error(`Database operation failed: ${context}`);
}