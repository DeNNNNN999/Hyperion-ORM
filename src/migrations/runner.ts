/**
 * Migration runner with transaction support and rollback capabilities
 * Handles migration execution, tracking, and conflict resolution
 */

import { createHash } from 'crypto';
import { Connection } from '../core/connection.js';
import type {
  Migration,
  MigrationRecord,
  MigrationPlan,
  MigrationOptions,
  MigrationResult,
  BatchMigrationResult,
  MigrationDirection,
  MigrationConflict,
  SQLStatement,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types.js';

export class MigrationRunner {
  private connection: Connection;
  private options: Required<MigrationOptions>;
  private migrations: Map<string, Migration> = new Map();

  constructor(connection: Connection, options: MigrationOptions = {}) {
    this.connection = connection;
    this.options = {
      directory: options.directory || './migrations',
      tableName: options.tableName || 'hyperion_migrations',
      schemaName: options.schemaName || 'public',
      logger: options.logger || this.createDefaultLogger(),
      dryRun: options.dryRun || false,
      force: options.force || false,
      transaction: options.transaction ?? true,
      lock: options.lock ?? true,
      lockTimeout: options.lockTimeout || 5000,
    };
  }

  /**
   * Register a migration
   */
  register(migration: Migration): void {
    if (this.migrations.has(migration.id)) {
      throw new Error(`Migration ${migration.id} is already registered`);
    }
    this.migrations.set(migration.id, migration);
  }

  /**
   * Register multiple migrations
   */
  registerAll(migrations: Migration[]): void {
    migrations.forEach(m => this.register(m));
  }

  /**
   * Get migration plan
   */
  async plan(): Promise<MigrationPlan> {
    await this.ensureMigrationTable();
    
    const applied = await this.getAppliedMigrations();
    const appliedIds = new Set(applied.map(r => r.id));
    
    const pending: Migration[] = [];
    const conflicts: MigrationConflict[] = [];
    
    // Sort migrations by timestamp
    const sortedMigrations = Array.from(this.migrations.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    
    for (const migration of sortedMigrations) {
      const record = applied.find(r => r.id === migration.id);
      
      if (!record) {
        pending.push(migration);
      } else {
        // Check for conflicts
        const checksum = this.calculateChecksum(migration);
        if (record.checksum !== checksum) {
          conflicts.push({
            migration,
            record,
            reason: 'checksum_mismatch',
            details: `Expected checksum ${checksum}, found ${record.checksum}`,
          });
        }
      }
    }
    
    // Check for missing migrations
    for (const record of applied) {
      if (!this.migrations.has(record.id) && record.status === 'applied') {
        conflicts.push({
          migration: this.createPlaceholderMigration(record),
          record,
          reason: 'missing_migration',
          details: `Migration ${record.id} exists in database but not in code`,
        });
      }
    }
    
    return { pending, applied, conflicts };
  }

  /**
   * Validate migrations
   */
  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    for (const [id, migration] of this.migrations) {
      // Check SQL syntax
      try {
        const upSql = await this.resolveSQLStatements(migration.up);
        const downSql = await this.resolveSQLStatements(migration.down);
        
        // Basic validation
        if (upSql.length === 0) {
          errors.push({
            migration: id,
            type: 'syntax',
            message: 'Migration has no up statements',
          });
        }
        
        if (downSql.length === 0 && migration.down !== 'irreversible') {
          warnings.push({
            migration: id,
            type: 'compatibility',
            message: 'Migration has no down statements (not reversible)',
          });
        }
        
        // Check for destructive operations
        for (const sql of [...upSql, ...downSql]) {
          if (this.isDestructiveOperation(sql)) {
            warnings.push({
              migration: id,
              type: 'destructive',
              message: `Contains destructive operation: ${sql.substring(0, 50)}...`,
            });
          }
        }
      } catch (error) {
        errors.push({
          migration: id,
          type: 'syntax',
          message: `Failed to resolve SQL: ${error}`,
        });
      }
    }
    
    // Check for dependency conflicts
    const plan = await this.plan();
    for (const conflict of plan.conflicts) {
      errors.push({
        migration: conflict.migration.id,
        type: 'conflict',
        message: conflict.details,
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Run pending migrations
   */
  async up(target?: string): Promise<BatchMigrationResult> {
    const plan = await this.plan();
    
    if (plan.conflicts.length > 0 && !this.options.force) {
      throw new Error(
        `Cannot run migrations: ${plan.conflicts.length} conflicts found. ` +
        `Use force option to ignore conflicts.`
      );
    }
    
    let migrationsToRun = plan.pending;
    
    if (target) {
      const targetIndex = migrationsToRun.findIndex(m => m.id === target);
      if (targetIndex === -1) {
        throw new Error(`Target migration ${target} not found in pending migrations`);
      }
      migrationsToRun = migrationsToRun.slice(0, targetIndex + 1);
    }
    
    return this.runMigrations(migrationsToRun, 'up');
  }

  /**
   * Rollback migrations
   */
  async down(steps: number = 1, target?: string): Promise<BatchMigrationResult> {
    const applied = await this.getAppliedMigrations();
    const sortedApplied = applied
      .filter(r => r.status === 'applied')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    let migrationsToRollback: Migration[] = [];
    
    if (target) {
      const targetIndex = sortedApplied.findIndex(r => r.id === target);
      if (targetIndex === -1) {
        throw new Error(`Target migration ${target} not found in applied migrations`);
      }
      
      for (let i = 0; i <= targetIndex; i++) {
        const record = sortedApplied[i];
        const migration = this.migrations.get(record.id);
        if (!migration) {
          throw new Error(`Migration ${record.id} not found in registry`);
        }
        migrationsToRollback.push(migration);
      }
    } else {
      for (let i = 0; i < steps && i < sortedApplied.length; i++) {
        const record = sortedApplied[i];
        const migration = this.migrations.get(record.id);
        if (!migration) {
          throw new Error(`Migration ${record.id} not found in registry`);
        }
        migrationsToRollback.push(migration);
      }
    }
    
    return this.runMigrations(migrationsToRollback, 'down');
  }

  /**
   * Reset all migrations
   */
  async reset(): Promise<BatchMigrationResult> {
    const applied = await this.getAppliedMigrations();
    const count = applied.filter(r => r.status === 'applied').length;
    
    if (count === 0) {
      return {
        successful: [],
        failed: [],
        totalTime: 0,
      };
    }
    
    return this.down(count);
  }

  /**
   * Run migrations up to latest
   */
  async latest(): Promise<BatchMigrationResult> {
    return this.up();
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    current: string | null;
    pending: string[];
    applied: string[];
  }> {
    const plan = await this.plan();
    const applied = plan.applied
      .filter(r => r.status === 'applied')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return {
      current: applied[0]?.id || null,
      pending: plan.pending.map(m => m.id),
      applied: applied.map(r => r.id),
    };
  }

  // Private methods

  private async ensureMigrationTable(): Promise<void> {
    const tableExists = await this.connection.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_name = $2
      )`,
      [this.options.schemaName, this.options.tableName]
    );
    
    if (!tableExists.rows[0].exists) {
      await this.createMigrationTable();
    }
  }

  private async createMigrationTable(): Promise<void> {
    await this.connection.query(`
      CREATE TABLE IF NOT EXISTS ${this.options.schemaName}.${this.options.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        timestamp BIGINT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
        execution_time INTEGER NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL,
        error TEXT
      )
    `);
    
    await this.connection.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.options.tableName}_timestamp 
      ON ${this.options.schemaName}.${this.options.tableName} (timestamp)
    `);
  }

  private async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.connection.query(
      `SELECT * FROM ${this.options.schemaName}.${this.options.tableName} 
       ORDER BY timestamp ASC`
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      timestamp: parseInt(row.timestamp),
      appliedAt: new Date(row.applied_at),
      executionTime: row.execution_time,
      checksum: row.checksum,
      status: row.status,
      error: row.error,
    }));
  }

  private async runMigrations(
    migrations: Migration[],
    direction: MigrationDirection
  ): Promise<BatchMigrationResult> {
    const results: MigrationResult[] = [];
    const startTime = Date.now();
    
    if (this.options.lock) {
      await this.acquireLock();
    }
    
    try {
      for (const migration of migrations) {
        const result = await this.runMigration(migration, direction);
        results.push(result);
        
        if (!result.success) {
          break; // Stop on first failure
        }
      }
      
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      return {
        successful,
        failed,
        totalTime: Date.now() - startTime,
      };
    } finally {
      if (this.options.lock) {
        await this.releaseLock();
      }
    }
  }

  private async runMigration(
    migration: Migration,
    direction: MigrationDirection
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    
    this.options.logger.info(
      `${direction === 'up' ? 'Applying' : 'Rolling back'} migration: ${migration.name}`
    );
    
    try {
      const statements = await this.resolveSQLStatements(
        direction === 'up' ? migration.up : migration.down
      );
      
      if (this.options.dryRun) {
        this.options.logger.info('Dry run - SQL that would be executed:');
        statements.forEach(sql => this.options.logger.debug(sql));
        
        return {
          migration,
          direction,
          success: true,
          executionTime: Date.now() - startTime,
          sql: statements,
        };
      }
      
      const useTransaction = migration.transactional ?? this.options.transaction;
      
      if (useTransaction) {
        await this.connection.query('BEGIN');
      }
      
      try {
        for (const sql of statements) {
          await this.connection.query(sql);
        }
        
        if (direction === 'up') {
          await this.recordMigration(migration, Date.now() - startTime);
        } else {
          await this.removeMigrationRecord(migration.id);
        }
        
        if (useTransaction) {
          await this.connection.query('COMMIT');
        }
        
        this.options.logger.info(
          `${direction === 'up' ? 'Applied' : 'Rolled back'} successfully in ${Date.now() - startTime}ms`
        );
        
        return {
          migration,
          direction,
          success: true,
          executionTime: Date.now() - startTime,
          sql: statements,
        };
      } catch (error) {
        if (useTransaction) {
          await this.connection.query('ROLLBACK');
        }
        throw error;
      }
    } catch (error) {
      this.options.logger.error(
        `Failed to ${direction === 'up' ? 'apply' : 'rollback'} migration: ${migration.name}`,
        error as Error
      );
      
      if (direction === 'up') {
        await this.recordFailedMigration(migration, error as Error, Date.now() - startTime);
      }
      
      return {
        migration,
        direction,
        success: false,
        executionTime: Date.now() - startTime,
        error: error as Error,
      };
    }
  }

  private async resolveSQLStatements(
    statements: SQLStatement | SQLStatement[]
  ): Promise<string[]> {
    const stmtArray = Array.isArray(statements) ? statements : [statements];
    const resolved: string[] = [];
    
    for (const stmt of stmtArray) {
      if (typeof stmt === 'string') {
        resolved.push(stmt);
      } else if (typeof stmt === 'function') {
        const result = await stmt();
        resolved.push(result);
      }
    }
    
    return resolved;
  }

  private calculateChecksum(migration: Migration): string {
    const content = JSON.stringify({
      id: migration.id,
      up: migration.up,
      down: migration.down,
    });
    
    return createHash('sha256').update(content).digest('hex');
  }

  private isDestructiveOperation(sql: string): boolean {
    const destructivePatterns = [
      /DROP\s+TABLE/i,
      /DROP\s+COLUMN/i,
      /DELETE\s+FROM/i,
      /TRUNCATE/i,
      /DROP\s+DATABASE/i,
      /DROP\s+SCHEMA/i,
    ];
    
    return destructivePatterns.some(pattern => pattern.test(sql));
  }

  private async recordMigration(
    migration: Migration,
    executionTime: number
  ): Promise<void> {
    await this.connection.query(
      `INSERT INTO ${this.options.schemaName}.${this.options.tableName} 
       (id, name, timestamp, execution_time, checksum, status) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        migration.id,
        migration.name,
        migration.timestamp,
        executionTime,
        this.calculateChecksum(migration),
        'applied',
      ]
    );
  }

  private async recordFailedMigration(
    migration: Migration,
    error: Error,
    executionTime: number
  ): Promise<void> {
    await this.connection.query(
      `INSERT INTO ${this.options.schemaName}.${this.options.tableName} 
       (id, name, timestamp, execution_time, checksum, status, error) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        migration.id,
        migration.name,
        migration.timestamp,
        executionTime,
        this.calculateChecksum(migration),
        'failed',
        error.message,
      ]
    );
  }

  private async removeMigrationRecord(id: string): Promise<void> {
    await this.connection.query(
      `UPDATE ${this.options.schemaName}.${this.options.tableName} 
       SET status = $1 WHERE id = $2`,
      ['rolled_back', id]
    );
  }

  private async acquireLock(): Promise<void> {
    // PostgreSQL advisory lock
    const lockId = this.hashToInt(this.options.tableName);
    const result = await this.connection.query(
      `SELECT pg_try_advisory_lock($1)`,
      [lockId]
    );
    
    if (!result.rows[0].pg_try_advisory_lock) {
      throw new Error('Could not acquire migration lock');
    }
  }

  private async releaseLock(): Promise<void> {
    const lockId = this.hashToInt(this.options.tableName);
    await this.connection.query(
      `SELECT pg_advisory_unlock($1)`,
      [lockId]
    );
  }

  private hashToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private createPlaceholderMigration(record: MigrationRecord): Migration {
    return {
      id: record.id,
      name: record.name,
      timestamp: record.timestamp,
      up: '-- Migration missing',
      down: '-- Migration missing',
    };
  }

  private createDefaultLogger() {
    return {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      error: (msg: string, err?: Error) => console.error(`[ERROR] ${msg}`, err || ''),
      debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
    };
  }
}