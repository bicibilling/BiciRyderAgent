const { createClient } = require('@supabase/supabase-js');

// Use exact credentials from .env
const SUPABASE_URL = 'https://qajewlgpohousxcdnodp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhamV3bGdwb2hvdXN4Y2Rub2RwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQ0NTEyMywiZXhwIjoyMDcwMDIxMTIzfQ.GfLryGIV-lr6mOW8glKE4v47m6_gj4IOr2pyE6IZ_qU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createTables() {
    console.log('Starting database setup...');
    
    try {
        // Test connection first
        console.log('Testing connection...');
        const { data: testData, error: testError } = await supabase
            .from('_realtime')
            .select('*')
            .limit(1);
            
        if (testError && testError.code !== 'PGRST205') {
            console.error('Connection test failed:', testError);
            return;
        }
        
        console.log('✓ Connection successful');
        
        // Skip table creation - assume it exists or will be created by migration
        console.log('Proceeding to insert data...');
        
        // Insert default organization
        console.log('Inserting default organization...');
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .upsert({
                id: 'b0c1b1c1-0000-0000-0000-000000000001',
                name: 'BICI Bike Store',
                phone_number: '+17786528784',
                settings: {
                    business_hours: {
                        monday: { open: "09:00", close: "18:00" },
                        tuesday: { open: "09:00", close: "18:00" },
                        wednesday: { open: "09:00", close: "18:00" },
                        thursday: { open: "09:00", close: "18:00" },
                        friday: { open: "09:00", close: "18:00" },
                        saturday: { open: "09:00", close: "17:00" },
                        sunday: { open: "10:00", close: "16:00" }
                    },
                    location: {
                        address: "123 Bike Street, Vancouver, BC",
                        coordinates: { lat: 49.2827, lng: -123.1207 }
                    },
                    services: ["bike sales", "repairs", "rentals", "accessories"]
                }
            }, {
                onConflict: 'id'
            });
        
        if (orgError) {
            console.error('Error inserting organization:', orgError);
        } else {
            console.log('✓ Default organization created/updated');
        }
        
    } catch (error) {
        console.error('Setup error:', error);
    }
}

createTables();