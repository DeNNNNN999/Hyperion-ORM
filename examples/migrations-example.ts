/**
 * Migration system usage examples
 * Demonstrates database schema migrations with rollback support
 */

import { MigrationRunner, MigrationGenerator } from '../src/migrations/index.js';
import { Connection } from '../src/core/connection.js';
import { schema, column } from '../src/schema/builder.js';
import type { Migration } from '../src/migrations/types.js';

// Example migration definitions
const migration1: Migration = {
  id: '20241201000001_create_users_table',
  name: 'create_users_table',
  timestamp: 1701388800000,
  up: [
    `CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      age INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    'CREATE INDEX idx_users_email ON users (email)',
    'CREATE INDEX idx_users_active ON users (is_active)',
  ],
  down: [
    'DROP INDEX idx_users_active',
    'DROP INDEX idx_users_email',
    'DROP TABLE users',
  ],
  transactional: true,
};

const migration2: Migration = {
  id: '20241201000002_create_posts_table',
  name: 'create_posts_table',
  timestamp: 1701389100000,
  up: [
    `CREATE TABLE posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      content TEXT,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      published BOOLEAN DEFAULT false,
      view_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    'CREATE INDEX idx_posts_author ON posts (author_id)',
    'CREATE INDEX idx_posts_published ON posts (published, created_at)',
  ],
  down: [
    'DROP INDEX idx_posts_published',
    'DROP INDEX idx_posts_author',
    'DROP TABLE posts',
  ],
};

const migration3: Migration = {
  id: '20241201000003_add_posts_slug',
  name: 'add_posts_slug',
  timestamp: 1701389400000,
  up: [
    'ALTER TABLE posts ADD COLUMN slug VARCHAR(255)',
    'UPDATE posts SET slug = LOWER(REPLACE(title, \' \', \'-\'))',
    'ALTER TABLE posts ALTER COLUMN slug SET NOT NULL',
    'CREATE UNIQUE INDEX idx_posts_slug ON posts (slug)',
  ],
  down: [
    'DROP INDEX idx_posts_slug',
    'ALTER TABLE posts DROP COLUMN slug',
  ],
};

// Migration with destructive operation
const migration4: Migration = {
  id: '20241201000004_remove_old_columns',
  name: 'remove_old_columns',
  timestamp: 1701389700000,
  up: [
    'ALTER TABLE users DROP COLUMN age',
    'ALTER TABLE posts DROP COLUMN view_count',
  ],
  down: [
    '-- WARNING: Data loss! These columns contained data.',
    'ALTER TABLE users ADD COLUMN age INTEGER',
    'ALTER TABLE posts ADD COLUMN view_count INTEGER DEFAULT 0',
  ],
};

async function migrationExamples() {
  // Initialize connection (normally from environment)
  const connection = new Connection({
    host: 'localhost',
    port: 5432,
    database: 'hyperion_example',
    user: 'postgres',
    password: 'password',
  });

  // Custom logger for colored output
  const logger = {
    info: (msg: string) => console.log(`🔄 ${msg}`),
    warn: (msg: string) => console.log(`⚠️  ${msg}`),
    error: (msg: string, err?: Error) => console.log(`❌ ${msg}`, err || ''),
    debug: (msg: string) => console.log(`🐛 ${msg}`),
  };

  const runner = new MigrationRunner(connection, {
    tableName: 'hyperion_migrations',
    logger,
    lock: true,
    transaction: true,
  });

  // Register all migrations
  runner.registerAll([migration1, migration2, migration3, migration4]);

  try {
    console.log('=== Migration System Demo ===\n');

    // Example 1: Check migration status
    console.log('📊 Checking migration status...');
    const status = await runner.status();
    console.log(`Current migration: ${status.current || 'None'}`);
    console.log(`Pending: ${status.pending.length}`);
    console.log(`Applied: ${status.applied.length}\n`);

    // Example 2: Validate all migrations
    console.log('🔍 Validating migrations...');
    const validation = await runner.validate();
    
    if (validation.errors.length > 0) {
      console.log('❌ Validation errors:');
      validation.errors.forEach(err => 
        console.log(`  - ${err.migration}: ${err.message}`)
      );
    }
    
    if (validation.warnings.length > 0) {
      console.log('⚠️  Validation warnings:');
      validation.warnings.forEach(warn => 
        console.log(`  - ${warn.migration}: ${warn.message}`)
      );
    }
    
    if (validation.valid) {
      console.log('✅ All migrations are valid\n');
    }

    // Example 3: Show migration plan
    console.log('📋 Migration plan:');
    const plan = await runner.plan();
    
    if (plan.conflicts.length > 0) {
      console.log('⚠️  Conflicts detected:');
      plan.conflicts.forEach(conflict => 
        console.log(`  - ${conflict.migration.name}: ${conflict.details}`)
      );
    }
    
    console.log(`Pending migrations (${plan.pending.length}):`);
    plan.pending.forEach(m => 
      console.log(`  - ${m.name} (${new Date(m.timestamp).toISOString()})`)
    );
    console.log();

    // Example 4: Run migrations step by step
    console.log('🚀 Running migrations step by step...\n');

    // Run first migration
    console.log('Step 1: Create users table');
    const result1 = await runner.up(migration1.id);
    console.log(`✅ Applied ${result1.successful.length} migration(s) in ${result1.totalTime}ms\n`);

    // Run second migration
    console.log('Step 2: Create posts table');
    const result2 = await runner.up(migration2.id);
    console.log(`✅ Applied ${result2.successful.length} migration(s) in ${result2.totalTime}ms\n`);

    // Check status again
    const statusAfter = await runner.status();
    console.log(`📊 Status update: ${statusAfter.applied.length} applied, ${statusAfter.pending.length} pending\n`);

    // Example 5: Rollback demonstration
    console.log('⏪ Demonstrating rollback...');
    
    // Rollback last migration
    const rollbackResult = await runner.down(1);
    console.log(`✅ Rolled back ${rollbackResult.successful.length} migration(s)\n`);

    // Example 6: Dry run
    console.log('🧪 Dry run of remaining migrations...');
    const dryRunner = new MigrationRunner(connection, {
      tableName: 'hyperion_migrations',
      logger,
      dryRun: true,
    });
    dryRunner.registerAll([migration2, migration3, migration4]);
    
    await dryRunner.up();
    console.log('✅ Dry run completed - no actual changes made\n');

    // Example 7: Run all remaining migrations
    console.log('🚀 Running all remaining migrations...');
    const finalResult = await runner.latest();
    console.log(`✅ Applied ${finalResult.successful.length} migration(s)\n`);

    // Final status
    const finalStatus = await runner.status();
    console.log('📊 Final status:');
    console.log(`Current: ${finalStatus.current}`);
    console.log(`Total applied: ${finalStatus.applied.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await connection.disconnect();
  }
}

// Migration generation examples
async function generationExamples() {
  console.log('\n=== Migration Generation Demo ===\n');
  
  const generator = new MigrationGenerator('./example-migrations');

  // Example 1: Generate from schema
  console.log('📝 Generating migration from schema...');
  
  const CommentSchema = schema('Comment', {
    id: column.uuid().primary().default('gen_random_uuid()'),
    postId: column.uuid(),
    userId: column.uuid(),
    content: column.text(),
    likes: column.number().default(0),
    createdAt: column.timestamp().default('now()'),
  })
    .tableName('comments')
    .indexes(
      { columns: ['postId'] },
      { columns: ['userId'] },
      { columns: ['createdAt'] }
    )
    .build();

  const schemaFilepath = await generator.generate({
    name: 'create_comments_table',
    schemas: [CommentSchema],
    reversible: true,
  });
  
  console.log(`✅ Generated: ${schemaFilepath}`);

  // Example 2: Generate with custom SQL
  console.log('\n📝 Generating custom SQL migration...');
  
  const customFilepath = await generator.generate({
    name: 'add_full_text_search',
    sql: [
      'ALTER TABLE posts ADD COLUMN search_vector tsvector',
      `UPDATE posts SET search_vector = to_tsvector('english', title || ' ' || COALESCE(content, ''))`,
      'CREATE INDEX idx_posts_search ON posts USING gin(search_vector)',
    ],
    reversible: true,
  });
  
  console.log(`✅ Generated: ${customFilepath}`);

  // Example 3: Generate irreversible migration
  console.log('\n📝 Generating irreversible migration...');
  
  const irreversibleFilepath = await generator.generate({
    name: 'cleanup_old_data',
    sql: [
      'DELETE FROM posts WHERE created_at < NOW() - INTERVAL \'1 year\'',
      'VACUUM ANALYZE posts',
    ],
    reversible: false,
  });
  
  console.log(`✅ Generated: ${irreversibleFilepath}`);
  console.log('⚠️  This migration cannot be rolled back!');
}

// CLI usage examples
function cliExamples() {
  console.log('\n=== CLI Usage Examples ===\n');
  
  console.log('# Check migration status');
  console.log('npx hyperion-migrate status\n');
  
  console.log('# Run all pending migrations');
  console.log('npx hyperion-migrate up\n');
  
  console.log('# Run migrations up to specific target');
  console.log('npx hyperion-migrate up --target 20241201000002_create_posts_table\n');
  
  console.log('# Dry run (show SQL without executing)');
  console.log('npx hyperion-migrate up --dry-run\n');
  
  console.log('# Rollback last migration');
  console.log('npx hyperion-migrate down\n');
  
  console.log('# Rollback multiple migrations');
  console.log('npx hyperion-migrate down --steps 3\n');
  
  console.log('# Rollback to specific migration');
  console.log('npx hyperion-migrate down --target 20241201000001_create_users_table\n');
  
  console.log('# Reset all migrations (DANGEROUS!)');
  console.log('npx hyperion-migrate reset --force\n');
  
  console.log('# Generate new migration');
  console.log('npx hyperion-migrate generate "add user profiles"\n');
  
  console.log('# Generate with custom SQL');
  console.log('npx hyperion-migrate generate "add indexes" --sql "CREATE INDEX ..." --sql "CREATE INDEX ..."\n');
  
  console.log('# Validate all migrations');
  console.log('npx hyperion-migrate validate\n');
}

// Production tips
function productionTips() {
  console.log('\n=== Production Tips ===\n');
  
  const tips = [
    '🔒 Always use advisory locks in production to prevent concurrent migrations',
    '📋 Test all migrations in staging environment first',
    '⏱️  Use dry-run to verify SQL before applying to production',
    '🔄 Keep migration files in version control',
    '📊 Monitor migration execution time and database performance',
    '🚨 Have rollback plan ready for destructive operations',
    '🔍 Validate migrations before deployment',
    '📝 Document complex migrations with clear comments',
    '⚡ Use concurrent index creation for large tables',
    '🎯 Keep migrations focused and atomic',
  ];
  
  tips.forEach(tip => console.log(tip));
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve()
    .then(() => migrationExamples())
    .then(() => generationExamples())
    .then(() => cliExamples())
    .then(() => productionTips())
    .catch(console.error);
}