const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qajewlgpohousxcdnodp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhamV3bGdwb2hvdXN4Y2Rub2RwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQ0NTEyMywiZXhwIjoyMDcwMDIxMTIzfQ.GfLryGIV-lr6mOW8glKE4v47m6_gj4IOr2pyE6IZ_qU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    console.log('=== CHECKING DATABASE SCHEMA ===');
    
    const tablesToCheck = ['organizations', 'leads', 'conversations', 'call_sessions'];
    
    for (const table of tablesToCheck) {
        console.log(`\nChecking table: ${table}`);
        
        try {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);
            
            if (error) {
                console.error(`❌ Error accessing ${table}:`, error);
            } else {
                console.log(`✅ Table ${table} exists and accessible`);
                if (data && data.length > 0) {
                    console.log(`   Sample record:`, data[0]);
                } else {
                    console.log(`   Table is empty`);
                }
            }
        } catch (err) {
            console.error(`❌ Exception checking ${table}:`, err);
        }
    }
    
    // Try to create missing tables
    console.log('\n=== CREATING MISSING TABLES ===');
    
    // Check if leads table exists, if not create it
    console.log('\nChecking/creating leads table...');
    try {
        const { data: leadsData, error: leadsError } = await supabase
            .from('leads')
            .select('*')
            .limit(1);
            
        if (leadsError && leadsError.code === 'PGRST205') {
            console.log('Leads table missing, creating it...');
            
            const { data, error } = await supabase
                .from('organizations')
                .insert({
                    id: 'temp-test-' + Date.now(),
                    name: 'Test Insert',
                    phone_number: '+1234567890'
                })
                .select()
                .single();
                
            if (error) {
                console.error('❌ Cannot create data, database might be read-only:', error);
            } else {
                console.log('✅ Test insert successful');
                // Clean up
                await supabase
                    .from('organizations')
                    .delete()
                    .eq('id', data.id);
            }
        } else if (leadsError) {
            console.error('❌ Leads table error:', leadsError);
        } else {
            console.log('✅ Leads table exists');
        }
    } catch (err) {
        console.error('❌ Error checking leads:', err);
    }
}

checkSchema();