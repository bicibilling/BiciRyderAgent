#!/usr/bin/env node

/**
 * BICI AI Assistant Setup Script
 * Automated setup and configuration for production deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class SetupManager {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.config = {};
  }

  async run() {
    console.log('🚴‍♂️ BICI AI Assistant Setup');
    console.log('==============================\n');

    try {
      await this.checkPrerequisites();
      await this.collectConfiguration();
      await this.generateSecrets();
      await this.createEnvironmentFile();
      await this.setupDirectories();
      await this.setupDatabase();
      await this.validateConfiguration();
      await this.displayInstructions();
      
      console.log('✅ Setup completed successfully!');
      
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async checkPrerequisites() {
    console.log('📋 Checking prerequisites...\n');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }
    console.log(`✅ Node.js: ${nodeVersion}`);

    // Check if package.json exists
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }
    console.log('✅ package.json found');

    // Check if .env.example exists
    const envExamplePath = path.join(rootDir, '.env.example');
    if (!fs.existsSync(envExamplePath)) {
      throw new Error('.env.example not found');
    }
    console.log('✅ .env.example found');

    console.log('');
  }

  async collectConfiguration() {
    console.log('⚙️ Configuration Setup');
    console.log('Please provide the following information:\n');

    // Basic configuration
    this.config.NODE_ENV = await this.prompt('Environment (development/production)', 'development');
    this.config.PORT = await this.prompt('Server port', '3000');
    this.config.DASHBOARD_WS_PORT = await this.prompt('WebSocket port', '8080');
    this.config.BASE_URL = await this.prompt('Base URL', 'http://localhost:3000');

    console.log('\n🔐 Security Configuration:');
    
    // Generate or use provided secrets
    const generateSecrets = await this.promptYesNo('Generate security secrets automatically?', true);
    if (!generateSecrets) {
      this.config.JWT_SECRET = await this.prompt('JWT Secret (64+ characters)');
      this.config.SIGNED_URL_SECRET = await this.prompt('Signed URL Secret (64+ characters)');
      this.config.API_SECRET_TOKEN = await this.prompt('API Secret Token');
    }

    console.log('\n📞 ElevenLabs Configuration:');
    this.config.ELEVENLABS_API_KEY = await this.prompt('ElevenLabs API Key');
    this.config.ELEVENLABS_AGENT_ID = await this.prompt('ElevenLabs Agent ID');
    this.config.ELEVENLABS_VOICE_ID = await this.prompt('ElevenLabs Voice ID');
    this.config.ELEVENLABS_PHONE_NUMBER_ID = await this.prompt('ElevenLabs Phone Number ID');

    console.log('\n☎️ Twilio Configuration:');
    this.config.TWILIO_ACCOUNT_SID = await this.prompt('Twilio Account SID');
    this.config.TWILIO_AUTH_TOKEN = await this.prompt('Twilio Auth Token');
    this.config.TWILIO_PHONE_NUMBER = await this.prompt('Twilio Phone Number (e.g., +1234567890)');

    console.log('\n👥 Human Agent Configuration:');
    this.config.HUMAN_AGENT_PHONE_1 = await this.prompt('Primary Agent Phone', '+1234567891');
    this.config.HUMAN_AGENT_PHONE_2 = await this.prompt('Secondary Agent Phone', '+1234567892');
    this.config.MANAGER_PHONE = await this.prompt('Manager Phone', '+1234567893');

    const setupIntegrations = await this.promptYesNo('\nConfigure integrations (Supabase, HubSpot, Shopify, Calendar)?', true);
    
    if (setupIntegrations) {
      await this.collectIntegrationConfig();
    }

    console.log('');
  }

  async collectIntegrationConfig() {
    console.log('\n🗄️ Supabase Configuration:');
    this.config.SUPABASE_URL = await this.prompt('Supabase URL');
    this.config.SUPABASE_ANON_KEY = await this.prompt('Supabase Anon Key');
    this.config.SUPABASE_SERVICE_KEY = await this.prompt('Supabase Service Key');

    console.log('\n📊 Redis Configuration (optional):');
    const useRedis = await this.promptYesNo('Use Redis for session management?', false);
    if (useRedis) {
      this.config.UPSTASH_REDIS_URL = await this.prompt('Upstash Redis URL');
      this.config.UPSTASH_REDIS_TOKEN = await this.prompt('Upstash Redis Token');
    }

    console.log('\n🏢 HubSpot Configuration (optional):');
    const useHubSpot = await this.promptYesNo('Enable HubSpot CRM integration?', false);
    if (useHubSpot) {
      this.config.HUBSPOT_ACCESS_TOKEN = await this.prompt('HubSpot Access Token');
      this.config.HUBSPOT_PORTAL_ID = await this.prompt('HubSpot Portal ID');
    }

    console.log('\n🛍️ Shopify Configuration (optional):');
    const useShopify = await this.promptYesNo('Enable Shopify integration?', false);
    if (useShopify) {
      this.config.SHOPIFY_DOMAIN = await this.prompt('Shopify Domain (e.g., store.myshopify.com)');
      this.config.SHOPIFY_ACCESS_TOKEN = await this.prompt('Shopify Access Token');
      this.config.SHOPIFY_WEBHOOK_SECRET = await this.prompt('Shopify Webhook Secret (optional)', '');
    }

    console.log('\n📅 Google Calendar Configuration (optional):');
    const useCalendar = await this.promptYesNo('Enable Google Calendar integration?', false);
    if (useCalendar) {
      console.log('📝 You will need to provide the Google Service Account JSON credentials.');
      console.log('Please prepare your service account key file.');
      
      const keyPath = await this.prompt('Path to Google Service Account JSON file');
      if (fs.existsSync(keyPath)) {
        const keyContent = fs.readFileSync(keyPath, 'utf8');
        this.config.GOOGLE_SERVICE_ACCOUNT_KEY = keyContent;
      } else {
        console.log('⚠️ Service account file not found. You can set this manually later.');
      }
      
      this.config.CALENDAR_ID_MAIN = await this.prompt('Main Calendar ID', 'primary');
      this.config.CALENDAR_ID_MAINTENANCE = await this.prompt('Maintenance Calendar ID (optional)', '');
      this.config.CALENDAR_ID_REPAIR = await this.prompt('Repair Calendar ID (optional)', '');
      this.config.CALENDAR_ID_FITTING = await this.prompt('Fitting Calendar ID (optional)', '');
      this.config.CALENDAR_ID_SALES = await this.prompt('Sales Calendar ID (optional)', '');
    }
  }

  async generateSecrets() {
    console.log('🔐 Generating security secrets...');

    if (!this.config.JWT_SECRET) {
      this.config.JWT_SECRET = crypto.randomBytes(64).toString('hex');
      console.log('✅ Generated JWT secret');
    }

    if (!this.config.SIGNED_URL_SECRET) {
      this.config.SIGNED_URL_SECRET = crypto.randomBytes(64).toString('hex');
      console.log('✅ Generated signed URL secret');
    }

    if (!this.config.API_SECRET_TOKEN) {
      this.config.API_SECRET_TOKEN = crypto.randomBytes(32).toString('hex');
      console.log('✅ Generated API secret token');
    }

    console.log('');
  }

  async createEnvironmentFile() {
    console.log('📄 Creating environment file...');

    const envPath = path.join(rootDir, '.env');
    const envExamplePath = path.join(rootDir, '.env.example');

    // Read the example file
    let envContent = fs.readFileSync(envExamplePath, 'utf8');

    // Replace placeholders with actual values
    Object.entries(this.config).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const replacement = `${key}=${value}`;
        
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, replacement);
        } else {
          envContent += `\n${replacement}`;
        }
      }
    });

    // Write the .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created');

    // Set secure permissions
    try {
      fs.chmodSync(envPath, 0o600);
      console.log('✅ Set secure file permissions');
    } catch (error) {
      console.log('⚠️ Could not set file permissions (Windows/permission issue)');
    }

    console.log('');
  }

  async setupDirectories() {
    console.log('📁 Creating directories...');

    const directories = [
      'logs',
      'uploads',
      'tmp',
      'backups'
    ];

    directories.forEach(dir => {
      const dirPath = path.join(rootDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created ${dir}/ directory`);
      }
    });

    // Create .gitkeep files
    directories.forEach(dir => {
      const gitkeepPath = path.join(rootDir, dir, '.gitkeep');
      if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '');
      }
    });

    console.log('');
  }

  async setupDatabase() {
    if (!this.config.SUPABASE_URL) {
      console.log('⚠️ Skipping database setup (no Supabase configuration)');
      return;
    }

    console.log('🗄️ Setting up database...');

    const runMigration = await this.promptYesNo('Run database migration now?', true);
    
    if (runMigration) {
      try {
        // This would run the database migration script
        console.log('📊 Database migration would run here...');
        console.log('✅ Database setup completed (simulated)');
      } catch (error) {
        console.log('⚠️ Database migration failed:', error.message);
        console.log('You can run it manually later with: npm run db:migrate');
      }
    } else {
      console.log('ℹ️ You can run database migration later with: npm run db:migrate');
    }

    console.log('');
  }

  async validateConfiguration() {
    console.log('🔍 Validating configuration...');

    const required = [
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_AGENT_ID',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN'
    ];

    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      console.log('❌ Missing required configuration:');
      missing.forEach(key => console.log(`   - ${key}`));
      throw new Error('Required configuration missing');
    }

    // Validate phone number format
    const phoneFields = ['TWILIO_PHONE_NUMBER', 'HUMAN_AGENT_PHONE_1', 'HUMAN_AGENT_PHONE_2', 'MANAGER_PHONE'];
    phoneFields.forEach(field => {
      if (this.config[field] && !this.config[field].match(/^\+\d{10,15}$/)) {
        console.log(`⚠️ Warning: ${field} may not be in correct format (+1234567890)`);
      }
    });

    console.log('✅ Configuration validation passed');
    console.log('');
  }

  async displayInstructions() {
    console.log('📋 Next Steps:');
    console.log('==============\n');

    console.log('1. Install dependencies:');
    console.log('   npm install\n');

    console.log('2. Start the development server:');
    console.log('   npm run dev\n');

    console.log('3. Access the dashboard:');
    console.log(`   http://localhost:${this.config.PORT || 3000}/dashboard\n`);

    console.log('4. Test the health endpoint:');
    console.log(`   curl http://localhost:${this.config.PORT || 3000}/health\n`);

    if (this.config.SUPABASE_URL) {
      console.log('5. Run database migration:');
      console.log('   npm run db:migrate\n');
    }

    console.log('6. Configure ElevenLabs agent:');
    console.log('   - Upload knowledge base files to ElevenLabs');
    console.log('   - Configure webhooks in ElevenLabs dashboard');
    console.log('   - Test with a phone call\n');

    console.log('7. Set up Twilio webhooks:');
    console.log(`   - Incoming call URL: ${this.config.BASE_URL}/api/webhooks/twilio/incoming`);
    console.log(`   - Status callback URL: ${this.config.BASE_URL}/api/webhooks/twilio/status\n`);

    console.log('8. Production deployment:');
    console.log('   npm run deploy\n');

    console.log('📖 For detailed documentation, see:');
    console.log('   README.md and /docs folder\n');
  }

  // Helper methods
  async prompt(question, defaultValue = '') {
    const defaultText = defaultValue ? ` (${defaultValue})` : '';
    
    return new Promise((resolve) => {
      this.rl.question(`${question}${defaultText}: `, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }

  async promptYesNo(question, defaultValue = false) {
    const defaultText = defaultValue ? ' (Y/n)' : ' (y/N)';
    
    return new Promise((resolve) => {
      this.rl.question(`${question}${defaultText}: `, (answer) => {
        const normalized = answer.trim().toLowerCase();
        
        if (normalized === '') {
          resolve(defaultValue);
        } else {
          resolve(normalized === 'y' || normalized === 'yes');
        }
      });
    });
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new SetupManager();
  setup.run().catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

export default SetupManager;