#!/usr/bin/env node
/**
 * CLI for managing database migrations
 * Provides commands for running, rolling back, and generating migrations
 */

import { program } from 'commander';
import { Connection } from '../core/connection.js';
import { MigrationRunner } from './runner.js';
import { MigrationGenerator } from './generator.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';

// CLI configuration
interface CLIConfig {
  database: string;
  host: string;
  port: number;
  user: string;
  password: string;
  migrationsDir: string;
  migrationsTable: string;
}

// Load configuration (in real app, from config file or env)
function loadConfig(): CLIConfig {
  return {
    database: process.env.DATABASE_NAME || 'hyperion_dev',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    migrationsDir: process.env.MIGRATIONS_DIR || './migrations',
    migrationsTable: process.env.MIGRATIONS_TABLE || 'hyperion_migrations',
  };
}

// Create connection
async function createConnection(config: CLIConfig): Promise<Connection> {
  const connection = new Connection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });
  
  await connection.connect();
  return connection;
}

// Load migrations from directory
async function loadMigrations(dir: string): Promise<any[]> {
  const files = await readdir(dir);
  const migrations = [];
  
  for (const file of files) {
    if (file.endsWith('.ts') || file.endsWith('.js')) {
      const module = await import(join(process.cwd(), dir, file));
      const migration = module.default || Object.values(module)[0];
      if (migration && migration.id) {
        migrations.push(migration);
      }
    }
  }
  
  return migrations.sort((a, b) => a.timestamp - b.timestamp);
}

// Format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Main program
program
  .name('hyperion-migrate')
  .description('Hyperion ORM migration tool')
  .version('1.0.0');

// Status command
program
  .command('status')
  .description('Show migration status')
  .action(async () => {
    const config = loadConfig();
    const connection = await createConnection(config);
    
    try {
      const runner = new MigrationRunner(connection, {
        directory: config.migrationsDir,
        tableName: config.migrationsTable,
      });
      
      const migrations = await loadMigrations(config.migrationsDir);
      runner.registerAll(migrations);
      
      const status = await runner.status();
      
      console.log(chalk.bold('\n📊 Migration Status\n'));
      
      if (status.current) {
        console.log(chalk.green(`✓ Current: ${status.current}`));
      } else {
        console.log(chalk.yellow('⚠ No migrations applied'));
      }
      
      console.log(chalk.cyan(`\n📁 Applied (${status.applied.length}):`));
      for (const id of status.applied) {
        console.log(chalk.gray(`  - ${id}`));
      }
      
      console.log(chalk.yellow(`\n⏳ Pending (${status.pending.length}):`));
      for (const id of status.pending) {
        console.log(chalk.gray(`  - ${id}`));
      }
      
    } finally {
      await connection.disconnect();
    }
  });

// Up command
program
  .command('up')
  .description('Run pending migrations')
  .option('-t, --target <migration>', 'Run migrations up to target')
  .option('-d, --dry-run', 'Show SQL without executing')
  .option('-f, --force', 'Force run despite conflicts')
  .action(async (options) => {
    const config = loadConfig();
    const connection = await createConnection(config);
    
    try {
      const runner = new MigrationRunner(connection, {
        directory: config.migrationsDir,
        tableName: config.migrationsTable,
        dryRun: options.dryRun,
        force: options.force,
      });
      
      const migrations = await loadMigrations(config.migrationsDir);
      runner.registerAll(migrations);
      
      console.log(chalk.bold('\n🚀 Running migrations...\n'));
      
      const result = await runner.up(options.target);
      
      if (result.successful.length > 0) {
        console.log(chalk.green(`✓ Applied ${result.successful.length} migration(s):`));
        for (const r of result.successful) {
          console.log(chalk.gray(`  - ${r.migration.name} (${formatDuration(r.executionTime)})`));
        }
      }
      
      if (result.failed.length > 0) {
        console.log(chalk.red(`\n✗ Failed ${result.failed.length} migration(s):`));
        for (const r of result.failed) {
          console.log(chalk.red(`  - ${r.migration.name}: ${r.error?.message}`));
        }
        process.exit(1);
      }
      
      console.log(chalk.gray(`\nTotal time: ${formatDuration(result.totalTime)}`));
      
    } finally {
      await connection.disconnect();
    }
  });

// Down command
program
  .command('down')
  .description('Rollback migrations')
  .option('-s, --steps <number>', 'Number of migrations to rollback', '1')
  .option('-t, --target <migration>', 'Rollback to target migration')
  .option('-d, --dry-run', 'Show SQL without executing')
  .action(async (options) => {
    const config = loadConfig();
    const connection = await createConnection(config);
    
    try {
      const runner = new MigrationRunner(connection, {
        directory: config.migrationsDir,
        tableName: config.migrationsTable,
        dryRun: options.dryRun,
      });
      
      const migrations = await loadMigrations(config.migrationsDir);
      runner.registerAll(migrations);
      
      console.log(chalk.bold('\n⏪ Rolling back migrations...\n'));
      
      const result = await runner.down(
        options.target ? undefined : parseInt(options.steps),
        options.target
      );
      
      if (result.successful.length > 0) {
        console.log(chalk.green(`✓ Rolled back ${result.successful.length} migration(s):`));
        for (const r of result.successful) {
          console.log(chalk.gray(`  - ${r.migration.name} (${formatDuration(r.executionTime)})`));
        }
      }
      
      if (result.failed.length > 0) {
        console.log(chalk.red(`\n✗ Failed ${result.failed.length} rollback(s):`));
        for (const r of result.failed) {
          console.log(chalk.red(`  - ${r.migration.name}: ${r.error?.message}`));
        }
        process.exit(1);
      }
      
    } finally {
      await connection.disconnect();
    }
  });

// Reset command
program
  .command('reset')
  .description('Reset all migrations')
  .option('-f, --force', 'Force reset without confirmation')
  .action(async (options) => {
    if (!options.force) {
      console.log(chalk.yellow('\n⚠️  This will rollback ALL migrations!'));
      console.log(chalk.yellow('Use --force to confirm.'));
      process.exit(1);
    }
    
    const config = loadConfig();
    const connection = await createConnection(config);
    
    try {
      const runner = new MigrationRunner(connection, {
        directory: config.migrationsDir,
        tableName: config.migrationsTable,
      });
      
      const migrations = await loadMigrations(config.migrationsDir);
      runner.registerAll(migrations);
      
      console.log(chalk.bold('\n🔄 Resetting all migrations...\n'));
      
      const result = await runner.reset();
      
      console.log(chalk.green(`✓ Reset complete: ${result.successful.length} migration(s) rolled back`));
      
    } finally {
      await connection.disconnect();
    }
  });

// Generate command
program
  .command('generate <name>')
  .description('Generate a new migration')
  .option('-s, --sql <statements...>', 'SQL statements for the migration')
  .option('-r, --reversible', 'Make migration reversible', true)
  .action(async (name, options) => {
    const config = loadConfig();
    const generator = new MigrationGenerator(config.migrationsDir);
    
    try {
      console.log(chalk.bold('\n📝 Generating migration...\n'));
      
      const filepath = await generator.generate({
        name,
        sql: options.sql,
        reversible: options.reversible,
      });
      
      console.log(chalk.green(`✓ Created migration: ${filepath}`));
      console.log(chalk.gray('\nDon\'t forget to edit the migration file!'));
      
    } catch (error) {
      console.error(chalk.red(`✗ Failed to generate migration: ${error}`));
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate all migrations')
  .action(async () => {
    const config = loadConfig();
    const connection = await createConnection(config);
    
    try {
      const runner = new MigrationRunner(connection, {
        directory: config.migrationsDir,
        tableName: config.migrationsTable,
      });
      
      const migrations = await loadMigrations(config.migrationsDir);
      runner.registerAll(migrations);
      
      console.log(chalk.bold('\n🔍 Validating migrations...\n'));
      
      const result = await runner.validate();
      
      if (result.errors.length > 0) {
        console.log(chalk.red(`✗ Found ${result.errors.length} error(s):`));
        for (const error of result.errors) {
          console.log(chalk.red(`  - ${error.migration}: ${error.message}`));
        }
      }
      
      if (result.warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠ Found ${result.warnings.length} warning(s):`));
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`  - ${warning.migration}: ${warning.message}`));
        }
      }
      
      if (result.valid) {
        console.log(chalk.green('\n✓ All migrations are valid'));
      } else {
        process.exit(1);
      }
      
    } finally {
      await connection.disconnect();
    }
  });

// Parse command line
program.parse();

// Export for testing
export { loadConfig, createConnection, loadMigrations };