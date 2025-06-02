/**
 * Type definitions for the migration system
 * Supports forward and rollback migrations with full type safety
 */

import type { EntitySchema } from '../schema/types.js';

// Migration status
export type MigrationStatus = 'pending' | 'applied' | 'failed' | 'rolled_back';

// Migration direction
export type MigrationDirection = 'up' | 'down';

// SQL statement that can be a string or a function returning string
export type SQLStatement = string | (() => string) | (() => Promise<string>);

// Migration definition
export interface Migration {
  id: string;
  name: string;
  timestamp: number;
  up: SQLStatement | SQLStatement[];
  down: SQLStatement | SQLStatement[];
  checksum?: string;
  transactional?: boolean;
}

// Migration record in database
export interface MigrationRecord {
  id: string;
  name: string;
  timestamp: number;
  appliedAt: Date;
  executionTime: number;
  checksum: string;
  status: MigrationStatus;
  error?: string;
}

// Migration plan
export interface MigrationPlan {
  pending: Migration[];
  applied: MigrationRecord[];
  conflicts: MigrationConflict[];
}

// Migration conflict
export interface MigrationConflict {
  migration: Migration;
  record: MigrationRecord;
  reason: 'checksum_mismatch' | 'missing_migration' | 'timestamp_conflict';
  details: string;
}

// Migration options
export interface MigrationOptions {
  directory?: string;
  tableName?: string;
  schemaName?: string;
  logger?: MigrationLogger;
  dryRun?: boolean;
  force?: boolean;
  transaction?: boolean;
  lock?: boolean;
  lockTimeout?: number;
}

// Migration logger
export interface MigrationLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
  debug(message: string): void;
}

// Migration generator options
export interface GenerateMigrationOptions {
  name: string;
  schemas?: EntitySchema[];
  sql?: string[];
  reversible?: boolean;
  timestamp?: number;
}

// Schema diff for auto-generation
export interface SchemaDiff {
  tables: {
    create: TableDefinition[];
    drop: string[];
    alter: TableAlteration[];
  };
  indexes: {
    create: IndexDefinition[];
    drop: IndexDrop[];
  };
  constraints: {
    create: ConstraintDefinition[];
    drop: ConstraintDrop[];
  };
}

// Table definition
export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey?: string[];
  indexes?: IndexDefinition[];
  constraints?: ConstraintDefinition[];
}

// Column definition for migrations
export interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
  default?: unknown;
  unique?: boolean;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  };
}

// Table alteration
export interface TableAlteration {
  name: string;
  addColumns?: ColumnDefinition[];
  dropColumns?: string[];
  alterColumns?: ColumnAlteration[];
  renameColumns?: { from: string; to: string }[];
}

// Column alteration
export interface ColumnAlteration {
  name: string;
  type?: string;
  nullable?: boolean;
  default?: unknown;
  dropDefault?: boolean;
}

// Index definition
export interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  where?: string;
  using?: 'btree' | 'hash' | 'gin' | 'gist';
  concurrent?: boolean;
}

// Index drop
export interface IndexDrop {
  name: string;
  table: string;
  concurrent?: boolean;
}

// Constraint definition
export interface ConstraintDefinition {
  name: string;
  table: string;
  type: 'foreign_key' | 'check' | 'unique';
  definition: string;
}

// Constraint drop
export interface ConstraintDrop {
  name: string;
  table: string;
}

// Migration execution result
export interface MigrationResult {
  migration: Migration;
  direction: MigrationDirection;
  success: boolean;
  executionTime: number;
  error?: Error;
  sql?: string[];
}

// Batch migration result
export interface BatchMigrationResult {
  successful: MigrationResult[];
  failed: MigrationResult[];
  totalTime: number;
}

// Migration validation result
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// Validation error
export interface ValidationError {
  migration: string;
  type: 'syntax' | 'checksum' | 'dependency' | 'conflict';
  message: string;
}

// Validation warning
export interface ValidationWarning {
  migration: string;
  type: 'destructive' | 'performance' | 'compatibility';
  message: string;
}