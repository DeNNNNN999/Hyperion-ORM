import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MigrationRunner } from './runner.js';
import { MigrationGenerator } from './generator.js';
import { Connection } from '../core/connection.js';
import { schema, column } from '../schema/builder.js';
import type { Migration, MigrationLogger } from './types.js';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

// Mock connection
const mockConnection = {
  query: vi.fn(),
} as unknown as Connection;

// Mock logger
const mockLogger: MigrationLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Test migrations
const testMigrations: Migration[] = [
  {
    id: '1640000000000_create_users_table',
    name: 'create_users_table',
    timestamp: 1640000000000,
    up: [
      'CREATE TABLE users (id UUID PRIMARY KEY, email VARCHAR(255) UNIQUE, name VARCHAR(255))',
      'CREATE INDEX idx_users_email ON users (email)',
    ],
    down: [
      'DROP INDEX idx_users_email',
      'DROP TABLE users',
    ],
  },
  {
    id: '1640000001000_add_age_to_users',
    name: 'add_age_to_users',
    timestamp: 1640000001000,
    up: 'ALTER TABLE users ADD COLUMN age INTEGER',
    down: 'ALTER TABLE users DROP COLUMN age',
  },
  {
    id: '1640000002000_create_posts_table',
    name: 'create_posts_table',
    timestamp: 1640000002000,
    up: async () => 'CREATE TABLE posts (id UUID PRIMARY KEY, title VARCHAR(255), user_id UUID REFERENCES users(id))',
    down: 'DROP TABLE posts',
  },
];

// Helper to create consistent mock implementation
function createMockQuery(overrides: Record<string, any> = {}) {
  return (sql: string, params?: any[]) => {
    // Default responses
    if (sql.includes('information_schema.tables')) {
      return Promise.resolve({ 
        rows: [{ exists: overrides.tableExists ?? false }], 
        rowCount: 1 
      });
    }
    if (sql.includes('pg_try_advisory_lock')) {
      return Promise.resolve({ 
        rows: [{ pg_try_advisory_lock: overrides.lockSuccess ?? true }], 
        rowCount: 1 
      });
    }
    if (sql.includes('pg_advisory_unlock')) {
      return Promise.resolve({ rows: [{}], rowCount: 1 });
    }
    if (sql.includes('SELECT * FROM') && sql.includes('hyperion_migrations')) {
      return Promise.resolve({ 
        rows: overrides.appliedMigrations || [], 
        rowCount: (overrides.appliedMigrations || []).length 
      });
    }
    if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (sql.includes('INSERT INTO') && sql.includes('hyperion_migrations')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (sql.includes('UPDATE') && sql.includes('hyperion_migrations')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    
    // Custom overrides
    if (overrides.customResponses) {
      for (const [pattern, response] of Object.entries(overrides.customResponses)) {
        if (sql.includes(pattern)) {
          if (response instanceof Error) {
            return Promise.reject(response);
          }
          return Promise.resolve(response);
        }
      }
    }
    
    // Default success
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
}

describe('MigrationRunner', () => {
  let runner: MigrationRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new MigrationRunner(mockConnection, { logger: mockLogger });
    mockConnection.query.mockImplementation(createMockQuery());
  });

  describe('initialization', () => {
    it('should create migration table if not exists', async () => {
      await runner.plan();
      
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS')
      );
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS')
      );
    });

    it('should not create table if already exists', async () => {
      mockConnection.query.mockImplementation(createMockQuery({ tableExists: true }));

      await runner.plan();
      
      expect(mockConnection.query).not.toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS')
      );
    });
  });

  describe('migration registration', () => {
    it('should register single migration', () => {
      expect(() => runner.register(testMigrations[0])).not.toThrow();
    });

    it('should register multiple migrations', () => {
      expect(() => runner.registerAll(testMigrations)).not.toThrow();
    });

    it('should throw on duplicate migration', () => {
      runner.register(testMigrations[0]);
      expect(() => runner.register(testMigrations[0])).toThrow('already registered');
    });
  });

  describe('migration planning', () => {
    beforeEach(() => {
      runner.registerAll(testMigrations);
    });

    it('should identify pending migrations', async () => {
      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        appliedMigrations: []
      }));

      const plan = await runner.plan();
      
      expect(plan.pending).toHaveLength(3);
      expect(plan.applied).toHaveLength(0);
      expect(plan.conflicts).toHaveLength(0);
    });

    it('should identify applied migrations', async () => {
      const appliedMigrations = [{
        id: testMigrations[0].id,
        name: testMigrations[0].name,
        timestamp: testMigrations[0].timestamp,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'abc123',
        status: 'applied',
      }];

      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        appliedMigrations
      }));

      const plan = await runner.plan();
      
      expect(plan.pending).toHaveLength(2);
      expect(plan.applied).toHaveLength(1);
    });

    it('should detect checksum conflicts', async () => {
      const migration = testMigrations[0];
      const appliedMigrations = [{
        id: migration.id,
        name: migration.name,
        timestamp: migration.timestamp,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'wrong_checksum',
        status: 'applied',
      }];

      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        appliedMigrations
      }));

      const plan = await runner.plan();
      
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].reason).toBe('checksum_mismatch');
    });

    it('should detect missing migrations', async () => {
      const appliedMigrations = [{
        id: 'missing_migration',
        name: 'missing_migration',
        timestamp: 1234567890,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'abc123',
        status: 'applied',
      }];

      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        appliedMigrations
      }));

      const plan = await runner.plan();
      
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].reason).toBe('missing_migration');
    });
  });

  describe('migration validation', () => {
    beforeEach(() => {
      runner.registerAll(testMigrations);
      mockConnection.query.mockImplementation(createMockQuery({ tableExists: true }));
    });

    it('should validate migrations successfully', async () => {
      const result = await runner.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect destructive operations', async () => {
      const destructiveMigration: Migration = {
        id: 'destructive',
        name: 'destructive',
        timestamp: Date.now(),
        up: 'DROP TABLE users',
        down: 'irreversible',
      };

      runner.register(destructiveMigration);
      
      const result = await runner.validate();
      
      expect(result.warnings.some(w => w.type === 'destructive')).toBe(true);
    });

    it('should warn about irreversible migrations', async () => {
      const irreversibleMigration: Migration = {
        id: 'irreversible',
        name: 'irreversible',
        timestamp: Date.now(),
        up: 'CREATE TABLE test (id INT)',
        down: [],
      };

      runner.register(irreversibleMigration);
      
      const result = await runner.validate();
      
      expect(result.warnings.some(w => 
        w.message.includes('not reversible')
      )).toBe(true);
    });
  });

  describe('migration execution', () => {
    beforeEach(() => {
      runner.registerAll(testMigrations);
      mockConnection.query.mockImplementation(createMockQuery({ tableExists: true }));
    });

    it('should run pending migrations', async () => {
      const result = await runner.up();
      
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      
      // Should execute migrations in order
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('create_users_table')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('add_age_to_users')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('create_posts_table')
      );
      
      // Should record migrations
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([testMigrations[0].id])
      );
    });

    it('should run migrations up to target', async () => {
      const result = await runner.up(testMigrations[1].id);
      
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle migration failures', async () => {
      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        customResponses: {
          'CREATE TABLE users': new Error('Table already exists')
        }
      }));

      const result = await runner.up();
      
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error?.message).toContain('Table already exists');
    });

    it('should rollback on failure when using transactions', async () => {
      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        customResponses: {
          'CREATE INDEX': new Error('Index error')
        }
      }));

      await runner.up();
      
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle dry run', async () => {
      const dryRunner = new MigrationRunner(mockConnection, { 
        logger: mockLogger,
        dryRun: true,
      });
      dryRunner.registerAll(testMigrations);

      const result = await dryRunner.up();
      
      expect(result.successful).toHaveLength(3);
      
      // Should not execute actual SQL
      expect(mockConnection.query).not.toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE users')
      );
      
      // Should log SQL that would be executed
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE users')
      );
    });
  });

  describe('migration rollback', () => {
    beforeEach(() => {
      runner.registerAll(testMigrations);
      
      const appliedMigrations = testMigrations.map(m => ({
        id: m.id,
        name: m.name,
        timestamp: m.timestamp,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'abc123',
        status: 'applied',
      }));

      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        appliedMigrations
      }));
    });

    it('should rollback last migration', async () => {
      const result = await runner.down(1);
      
      expect(result.successful).toHaveLength(1);
      expect(result.successful[0].migration.id).toBe(testMigrations[2].id);
      
      expect(mockConnection.query).toHaveBeenCalledWith('DROP TABLE posts');
    });

    it('should rollback multiple migrations', async () => {
      const result = await runner.down(2);
      
      expect(result.successful).toHaveLength(2);
      expect(result.successful[0].migration.id).toBe(testMigrations[2].id);
      expect(result.successful[1].migration.id).toBe(testMigrations[1].id);
    });

    it('should rollback to target migration', async () => {
      const result = await runner.down(undefined, testMigrations[0].id);
      
      expect(result.successful).toHaveLength(3);
    });

    it('should reset all migrations', async () => {
      const result = await runner.reset();
      
      expect(result.successful).toHaveLength(3);
    });
  });

  describe('migration status', () => {
    it('should return current status', async () => {
      runner.registerAll(testMigrations);
      
      const appliedMigrations = [{
        id: testMigrations[0].id,
        name: testMigrations[0].name,
        timestamp: testMigrations[0].timestamp,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'abc123',
        status: 'applied',
      }];

      mockConnection.query.mockImplementation(createMockQuery({ 
        tableExists: true,
        appliedMigrations
      }));

      const status = await runner.status();
      
      expect(status.current).toBe(testMigrations[0].id);
      expect(status.applied).toHaveLength(1);
      expect(status.pending).toHaveLength(2);
    });
  });
});

describe('MigrationGenerator', () => {
  const testDir = './test-migrations';
  let generator: MigrationGenerator;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    generator = new MigrationGenerator(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should generate migration from schemas', async () => {
    const UserSchema = schema('User', {
      id: column.uuid().primary(),
      email: column.string().unique(),
      name: column.string(),
    }).build();

    const filepath = await generator.generate({
      name: 'create_users_table',
      schemas: [UserSchema],
      reversible: true,
    });

    const content = readFileSync(filepath, 'utf-8');
    
    expect(content).toContain('CREATE TABLE users');
    expect(content).toContain('id UUID');
    expect(content).toContain('email VARCHAR(255) UNIQUE');
    expect(content).toContain('PRIMARY KEY (id)');
    expect(content).toContain('DROP TABLE users');
  });

  it('should generate migration with custom SQL', async () => {
    const filepath = await generator.generate({
      name: 'custom_migration',
      sql: ['CREATE INDEX idx_test ON users (email)'],
      reversible: true,
    });

    const content = readFileSync(filepath, 'utf-8');
    
    expect(content).toContain('CREATE INDEX idx_test');
    expect(content).toContain('Add rollback SQL here');
  });

  it('should generate irreversible migration', async () => {
    const filepath = await generator.generate({
      name: 'irreversible_migration',
      sql: ['DROP TABLE old_table'],
      reversible: false,
    });

    const content = readFileSync(filepath, 'utf-8');
    
    expect(content).toContain('DROP TABLE old_table');
    expect(content).toContain('Not reversible');
  });

  it('should sanitize migration names', async () => {
    const filepath = await generator.generate({
      name: 'Test Migration-Name!!!',
      sql: ['SELECT 1'],
    });

    expect(filepath).toMatch(/\d+_test_migration_name\.ts$/);
  });

  it('should generate proper TypeScript class names', async () => {
    const filepath = await generator.generate({
      name: 'add_user_profile',
      sql: ['SELECT 1'],
    });

    const content = readFileSync(filepath, 'utf-8');
    expect(content).toContain('export const AddUserProfile: Migration');
  });
});