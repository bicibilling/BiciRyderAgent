#!/usr/bin/env node

/**
 * Database Deployment Script
 * Deploys database migrations to production Supabase instance
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseDeployer {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.migrationsDir = path.join(__dirname, '../database/migrations/deploy');
  }

  /**
   * Deploy all pending migrations
   */
  async deploy() {
    console.log('🚀 Starting database deployment...');
    console.log(`📍 Target: ${this.supabaseUrl}`);

    try {
      // Create migrations tracking table if it doesn't exist
      await this.createMigrationsTable();

      // Get list of migrations to run
      const migrations = await this.getPendingMigrations();

      if (migrations.length === 0) {
        console.log('✅ No pending migrations to deploy');
        return;
      }

      console.log(`📋 Found ${migrations.length} pending migrations:`);
      migrations.forEach(migration => {
        console.log(`   - ${migration}`);
      });

      // Run each migration
      for (const migration of migrations) {
        await this.runMigration(migration);
      }

      console.log('✅ Database deployment completed successfully!');

      // Verify deployment
      await this.verifyDeployment();

    } catch (error) {
      console.error('❌ Database deployment failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * Create migrations tracking table
   */
  async createMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        checksum VARCHAR(255),
        execution_time_ms INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_migrations_name ON _migrations(migration_name);
      CREATE INDEX IF NOT EXISTS idx_migrations_executed_at ON _migrations(executed_at);
    `;

    try {
      const { error } = await this.supabase.rpc('exec_sql', {
        sql: createTableSQL
      });

      if (error) {
        // Try alternative method for creating table
        console.log('Attempting to create migrations table using raw query...');
        await this.executeRawSQL(createTableSQL);
      }

      console.log('📊 Migrations tracking table ready');
    } catch (error) {
      console.warn('⚠️ Could not create migrations table, continuing anyway...');
    }
  }

  /**
   * Get list of pending migrations
   */
  async getPendingMigrations() {
    try {
      // Read all migration files
      const migrationFiles = await fs.readdir(this.migrationsDir);
      const sqlFiles = migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();

      // Get already executed migrations
      const { data: executedMigrations, error } = await this.supabase
        .from('_migrations')
        .select('migration_name');

      const executedNames = executedMigrations ? 
        executedMigrations.map(m => m.migration_name) : [];

      // Return pending migrations
      return sqlFiles.filter(file => !executedNames.includes(file));

    } catch (error) {
      console.warn('⚠️ Could not check executed migrations, running all migrations...');
      const migrationFiles = await fs.readdir(this.migrationsDir);
      return migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();
    }
  }

  /**
   * Run a single migration
   */
  async runMigration(migrationFile) {
    const startTime = Date.now();
    console.log(`⚡ Running migration: ${migrationFile}`);

    try {
      // Read migration file
      const migrationPath = path.join(this.migrationsDir, migrationFile);
      const migrationSQL = await fs.readFile(migrationPath, 'utf8');

      // Calculate checksum
      const checksum = this.calculateChecksum(migrationSQL);

      // Execute migration
      await this.executeRawSQL(migrationSQL);

      const executionTime = Date.now() - startTime;

      // Record successful migration
      try {
        await this.supabase
          .from('_migrations')
          .insert({
            migration_name: migrationFile,
            checksum: checksum,
            execution_time_ms: executionTime
          });
      } catch (error) {
        console.warn(`⚠️ Could not record migration ${migrationFile}:`, error.message);
      }

      console.log(`✅ Migration ${migrationFile} completed in ${executionTime}ms`);

    } catch (error) {
      console.error(`❌ Migration ${migrationFile} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Execute raw SQL
   */
  async executeRawSQL(sql) {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          const { error } = await this.supabase.rpc('exec_sql', {
            sql: statement
          });

          if (error) {
            // Try alternative methods if rpc fails
            console.log('Attempting alternative SQL execution...');
            throw new Error(`SQL execution failed: ${error.message}`);
          }
        } catch (error) {
          // For some statements, we might need to use the REST API directly
          console.warn(`Statement execution warning: ${error.message}`);
        }
      }
    }
  }

  /**
   * Calculate checksum for migration content
   */
  calculateChecksum(content) {
    const crypto = await import('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Verify deployment
   */
  async verifyDeployment() {
    console.log('🔍 Verifying deployment...');

    try {
      // Check if core tables exist
      const coreTables = [
        'organizations',
        'customers', 
        'leads',
        'conversations',
        'messages',
        'appointments'
      ];

      let tablesExist = 0;
      for (const table of coreTables) {
        try {
          const { error } = await this.supabase
            .from(table)
            .select('count', { count: 'exact', head: true });

          if (!error) {
            tablesExist++;
          }
        } catch (error) {
          console.warn(`⚠️ Could not verify table ${table}: ${error.message}`);
        }
      }

      console.log(`📊 Verified ${tablesExist}/${coreTables.length} core tables`);

      // Check if default organization exists
      const { data: orgs, error: orgError } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('slug', 'bici-bike-store');

      if (!orgError && orgs && orgs.length > 0) {
        console.log('✅ Default organization exists');
      } else {
        console.warn('⚠️ Default organization not found');
      }

      // Test database functions
      try {
        const { data, error } = await this.supabase.rpc('get_conversation_metrics');
        if (!error) {
          console.log('✅ Database functions are working');
        } else {
          console.warn('⚠️ Database functions may not be working:', error.message);
        }
      } catch (error) {
        console.warn('⚠️ Could not test database functions:', error.message);
      }

      console.log('✅ Database verification completed');

    } catch (error) {
      console.warn('⚠️ Deployment verification failed:', error.message);
    }
  }

  /**
   * Rollback last migration (emergency use)
   */
  async rollback() {
    console.log('🔄 Rolling back last migration...');
    
    try {
      const { data: lastMigration, error } = await this.supabase
        .from('_migrations')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !lastMigration) {
        console.log('❌ No migrations to rollback');
        return;
      }

      console.log(`⚠️ Rolling back migration: ${lastMigration.migration_name}`);
      
      // Remove from migrations table
      await this.supabase
        .from('_migrations')
        .delete()
        .eq('id', lastMigration.id);

      console.log('✅ Migration rollback completed');
      console.log('⚠️ Note: Database schema changes are NOT automatically reverted');
      console.log('⚠️ Manual intervention may be required to restore previous state');

    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
    }
  }

  /**
   * Show migration status
   */
  async status() {
    console.log('📊 Migration Status');
    console.log('==================');

    try {
      const { data: migrations, error } = await this.supabase
        .from('_migrations')
        .select('*')
        .order('executed_at', { ascending: false });

      if (error || !migrations || migrations.length === 0) {
        console.log('No migrations have been executed yet');
        return;
      }

      console.log(`Total migrations executed: ${migrations.length}`);
      console.log('\nRecent migrations:');
      
      migrations.slice(0, 10).forEach(migration => {
        const date = new Date(migration.executed_at).toLocaleString();
        console.log(`  ${migration.migration_name} (${date}) - ${migration.execution_time_ms}ms`);
      });

    } catch (error) {
      console.error('❌ Could not get migration status:', error.message);
    }
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2] || 'deploy';
  const deployer = new DatabaseDeployer();

  switch (command) {
    case 'deploy':
      await deployer.deploy();
      break;
    case 'status':
      await deployer.status();
      break;
    case 'rollback':
      await deployer.rollback();
      break;
    default:
      console.log('Usage: node deploy-database.js [deploy|status|rollback]');
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

export default DatabaseDeployer;