const { createClient } = require('@supabase/supabase-js');

// Use exact credentials from .env
const SUPABASE_URL = 'https://qajewlgpohousxcdnodp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhamV3bGdwb2hvdXN4Y2Rub2RwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQ0NTEyMywiZXhwIjoyMDcwMDIxMTIzfQ.GfLryGIV-lr6mOW8glKE4v47m6_gj4IOr2pyE6IZ_qU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debugOrganization() {
    console.log('=== DEBUG ORGANIZATION LOOKUP ===');
    
    try {
        // Check if organizations table exists and what data is in it
        console.log('1. Checking all organizations...');
        const { data: allOrgs, error: allError } = await supabase
            .from('organizations')
            .select('*');
        
        if (allError) {
            console.error('Error fetching all organizations:', allError);
        } else {
            console.log('All organizations:', JSON.stringify(allOrgs, null, 2));
        }
        
        // Test the exact phone number lookup that's failing
        const testPhone = '+17786528784';
        console.log(`\n2. Testing lookup for phone: ${testPhone}`);
        
        const { data: exactMatch, error: exactError } = await supabase
            .from('organizations')
            .select('*')
            .eq('phone_number', testPhone)
            .single();
        
        if (exactError) {
            console.error('Exact match error:', exactError);
        } else {
            console.log('Exact match result:', exactMatch);
        }
        
        // Test normalized lookup
        const normalizedPhone = '17786528784';
        console.log(`\n3. Testing lookup for normalized phone: ${normalizedPhone}`);
        
        const { data: normalizedMatch, error: normalizedError } = await supabase
            .from('organizations')
            .select('*')
            .eq('phone_number', normalizedPhone)
            .single();
        
        if (normalizedError) {
            console.error('Normalized match error:', normalizedError);
        } else {
            console.log('Normalized match result:', normalizedMatch);
        }
        
        // Test default organization lookup
        console.log(`\n4. Testing default organization lookup...`);
        
        const { data: defaultOrg, error: defaultError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', 'b0c1b1c1-0000-0000-0000-000000000001')
            .single();
        
        if (defaultError) {
            console.error('Default org error:', defaultError);
        } else {
            console.log('Default organization:', defaultOrg);
        }
        
        // Test if there are any organizations at all
        console.log(`\n5. Count total organizations...`);
        const { count, error: countError } = await supabase
            .from('organizations')
            .select('*', { count: 'exact', head: true });
            
        if (countError) {
            console.error('Count error:', countError);
        } else {
            console.log('Total organizations count:', count);
        }
        
    } catch (error) {
        console.error('Debug error:', error);
    }
}

debugOrganization();