#!/usr/bin/env node

/**
 * Quick Deploy Script
 * Automated deployment helper for BICI AI Voice Agent
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class QuickDeploy {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ELEVENLABS_API_KEY',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN'
    ];
  }

  /**
   * Main deployment workflow
   */
  async deploy() {
    console.log('🚀 BICI AI Voice Agent - Quick Deploy');
    console.log('====================================\n');

    try {
      await this.checkPrerequisites();
      await this.validateEnvironment();
      await this.runTests();
      await this.buildApplication();
      await this.deployDatabase();
      await this.generateDeploymentReport();
      
      console.log('\n✅ Quick deployment completed successfully!');
      console.log('\n📋 Next Steps:');
      console.log('1. Push code to GitHub repository');
      console.log('2. Connect repository to Render');
      console.log('3. Configure environment variables in Render dashboard');
      console.log('4. Deploy services using render.yaml');
      console.log('\nSee DEPLOYMENT_GUIDE.md for detailed instructions.');

    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Check system prerequisites
   */
  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1));
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }
    console.log(`✓ Node.js ${nodeVersion}`);

    // Check npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`✓ npm ${npmVersion}`);
    } catch (error) {
      throw new Error('npm not found');
    }

    // Check git
    try {
      execSync('git --version', { encoding: 'utf8' });
      console.log('✓ Git available');
    } catch (error) {
      console.warn('⚠️ Git not found - manual deployment required');
    }

    // Check project structure
    const requiredFiles = [
      'package.json',
      'render.yaml',
      '.env.example',
      'frontend/package.json',
      'src/dashboard/dashboard-server.js'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(this.projectRoot, file);
      try {
        await fs.access(filePath);
        console.log(`✓ ${file}`);
      } catch (error) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
  }

  /**
   * Validate environment configuration
   */
  async validateEnvironment() {
    console.log('\n🔧 Validating environment...');

    // Check for .env file
    const envPath = path.join(this.projectRoot, '.env');
    try {
      await fs.access(envPath);
      console.log('✓ .env file found');
    } catch (error) {
      console.log('⚠️ .env file not found, using environment variables');
    }

    // Check required environment variables
    const missingVars = [];
    for (const envVar of this.requiredEnvVars) {
      if (!process.env[envVar]) {
        missingVars.push(envVar);
      } else {
        console.log(`✓ ${envVar}`);
      }
    }

    if (missingVars.length > 0) {
      console.log('\n⚠️ Missing environment variables:');
      missingVars.forEach(varName => {
        console.log(`   - ${varName}`);
      });
      console.log('\nSet these variables or create a .env file before deployment.');
    }

    // Validate specific configurations
    await this.validateDatabaseConnection();
    await this.validateExternalServices();
  }

  /**
   * Validate database connection
   */
  async validateDatabaseConnection() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('⏭️ Skipping database validation (credentials not provided)');
      return;
    }

    try {
      console.log('🔍 Testing database connection...');
      
      // Simple test using fetch
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
        }
      });

      if (response.ok) {
        console.log('✓ Database connection successful');
      } else {
        throw new Error(`Database test failed: ${response.status}`);
      }
    } catch (error) {
      console.warn(`⚠️ Database validation failed: ${error.message}`);
    }
  }

  /**
   * Validate external services
   */
  async validateExternalServices() {
    console.log('🔍 Testing external services...');

    // Test ElevenLabs API
    if (process.env.ELEVENLABS_API_KEY) {
      try {
        const response = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: {
            'Authorization': `Bearer ${process.env.ELEVENLABS_API_KEY}`
          }
        });

        if (response.ok) {
          console.log('✓ ElevenLabs API connection successful');
        } else {
          console.warn('⚠️ ElevenLabs API test failed');
        }
      } catch (error) {
        console.warn('⚠️ ElevenLabs API test failed:', error.message);
      }
    }

    // Test Twilio API
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`, {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        });

        if (response.ok) {
          console.log('✓ Twilio API connection successful');
        } else {
          console.warn('⚠️ Twilio API test failed');
        }
      } catch (error) {
        console.warn('⚠️ Twilio API test failed:', error.message);
      }
    }
  }

  /**
   * Run tests
   */
  async runTests() {
    console.log('\n🧪 Running tests...');

    try {
      // Install dependencies if needed
      console.log('📦 Installing dependencies...');
      execSync('npm install', { 
        cwd: this.projectRoot, 
        stdio: 'pipe' 
      });

      console.log('📦 Installing frontend dependencies...');
      execSync('npm install', { 
        cwd: path.join(this.projectRoot, 'frontend'), 
        stdio: 'pipe' 
      });

      // Run linting
      console.log('🔍 Running linter...');
      try {
        execSync('npm run lint', { 
          cwd: this.projectRoot, 
          stdio: 'pipe' 
        });
        console.log('✓ Linting passed');
      } catch (error) {
        console.warn('⚠️ Linting issues found (non-blocking)');
      }

      // Run frontend type checking
      console.log('🔍 Type checking...');
      try {
        execSync('npm run type-check', { 
          cwd: path.join(this.projectRoot, 'frontend'), 
          stdio: 'pipe' 
        });
        console.log('✓ Type checking passed');
      } catch (error) {
        console.warn('⚠️ Type checking issues found (non-blocking)');
      }

      // Run tests if available
      try {
        execSync('npm test', { 
          cwd: this.projectRoot, 
          stdio: 'pipe',
          env: { ...process.env, NODE_ENV: 'test' }
        });
        console.log('✓ Tests passed');
      } catch (error) {
        console.warn('⚠️ Some tests failed (non-blocking)');
      }

    } catch (error) {
      throw new Error(`Test phase failed: ${error.message}`);
    }
  }

  /**
   * Build application
   */
  async buildApplication() {
    console.log('\n🏗️ Building application...');

    try {
      // Build backend
      console.log('🔨 Building backend...');
      execSync('npm run build:backend', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });

      // Build frontend
      console.log('🔨 Building frontend...');
      execSync('npm run build:frontend', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });

      console.log('✅ Application built successfully');

      // Verify build outputs
      const frontendDist = path.join(this.projectRoot, 'frontend', 'dist');
      try {
        const files = await fs.readdir(frontendDist);
        console.log(`✓ Frontend build contains ${files.length} files`);
      } catch (error) {
        throw new Error('Frontend build output not found');
      }

    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  /**
   * Deploy database migrations
   */
  async deployDatabase() {
    console.log('\n🗄️ Deploying database...');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('⏭️ Skipping database deployment (credentials not provided)');
      return;
    }

    try {
      execSync('node scripts/deploy-database.js deploy', {
        cwd: this.projectRoot,
        stdio: 'inherit',
        env: process.env
      });

      console.log('✅ Database deployed successfully');
    } catch (error) {
      console.warn('⚠️ Database deployment failed:', error.message);
      console.log('   This can be run manually after deployment');
    }
  }

  /**
   * Generate deployment report
   */
  async generateDeploymentReport() {
    console.log('\n📊 Generating deployment report...');

    const report = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      components: {
        backend: {
          status: 'ready',
          entryPoint: 'src/dashboard/dashboard-server.js',
          port: process.env.PORT || 3000
        },
        frontend: {
          status: 'built',
          buildPath: 'frontend/dist',
          technology: 'Vite + React + TypeScript'
        },
        database: {
          status: process.env.SUPABASE_URL ? 'configured' : 'pending',
          provider: 'Supabase'
        },
        cache: {
          status: process.env.UPSTASH_REDIS_URL ? 'configured' : 'pending',
          provider: 'Upstash Redis'
        }
      },
      integrations: {
        elevenlabs: process.env.ELEVENLABS_API_KEY ? 'configured' : 'pending',
        twilio: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'pending',
        hubspot: process.env.HUBSPOT_ACCESS_TOKEN ? 'configured' : 'optional',
        shopify: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'optional',
        google: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'optional'
      },
      deployment: {
        platform: 'Render',
        configFile: 'render.yaml',
        cicd: '.github/workflows/deploy.yml'
      }
    };

    const reportPath = path.join(this.projectRoot, 'deployment-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log('✓ Deployment report saved to deployment-report.json');
    
    // Display summary
    console.log('\n📋 Deployment Summary:');
    console.log(`   • Timestamp: ${report.timestamp}`);
    console.log(`   • Backend: ${report.components.backend.status}`);
    console.log(`   • Frontend: ${report.components.frontend.status}`);
    console.log(`   • Database: ${report.components.database.status}`);
    console.log(`   • Cache: ${report.components.cache.status}`);
    
    const configuredIntegrations = Object.entries(report.integrations)
      .filter(([_, status]) => status === 'configured').length;
    console.log(`   • Integrations: ${configuredIntegrations} configured`);
  }

  /**
   * Show deployment checklist
   */
  showChecklist() {
    console.log('\n📝 Pre-Deployment Checklist:');
    console.log('□ Environment variables configured');
    console.log('□ Database credentials verified');
    console.log('□ External service API keys obtained');
    console.log('□ GitHub repository created');
    console.log('□ Render account created');
    console.log('□ Domain name configured (optional)');
    console.log('\n📖 For detailed instructions, see DEPLOYMENT_GUIDE.md');
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2] || 'deploy';
  const deployer = new QuickDeploy();

  switch (command) {
    case 'deploy':
      await deployer.deploy();
      break;
    case 'checklist':
      deployer.showChecklist();
      break;
    default:
      console.log('Usage: node quick-deploy.js [deploy|checklist]');
      process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default QuickDeploy;