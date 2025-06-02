/**
 * Migration generator for creating migration files from schemas
 * Supports automatic diff generation and manual SQL migrations
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { EntitySchema } from '../schema/types.js';
import type { 
  Migration, 
  GenerateMigrationOptions,
  SchemaDiff,
  TableDefinition,
  ColumnDefinition,
  TableAlteration,
} from './types.js';

export class MigrationGenerator {
  private readonly directory: string;

  constructor(directory: string = './migrations') {
    this.directory = directory;
    this.ensureDirectory();
  }

  /**
   * Generate a new migration
   */
  async generate(options: GenerateMigrationOptions): Promise<string> {
    const timestamp = options.timestamp || Date.now();
    const id = `${timestamp}_${this.sanitizeName(options.name)}`;
    const className = this.toPascalCase(options.name);
    
    let upStatements: string[] = [];
    let downStatements: string[] = [];

    if (options.schemas) {
      const diff = await this.generateSchemaDiff(options.schemas);
      upStatements = this.generateUpSQL(diff);
      downStatements = options.reversible ? this.generateDownSQL(diff) : ['-- Not reversible'];
    } else if (options.sql) {
      upStatements = options.sql;
      downStatements = options.reversible ? ['-- Add rollback SQL here'] : ['-- Not reversible'];
    }

    const migration: Migration = {
      id,
      name: options.name,
      timestamp,
      up: upStatements,
      down: downStatements,
    };

    const content = this.generateMigrationFile(migration, className);
    const filename = `${id}.ts`;
    const filepath = join(this.directory, filename);

    writeFileSync(filepath, content);

    return filepath;
  }

  /**
   * Generate SQL from schema diff
   */
  generateUpSQL(diff: SchemaDiff): string[] {
    const statements: string[] = [];

    // Create tables
    for (const table of diff.tables.create) {
      statements.push(this.generateCreateTableSQL(table));
    }

    // Alter tables
    for (const alteration of diff.tables.alter) {
      statements.push(...this.generateAlterTableSQL(alteration));
    }

    // Create indexes
    for (const index of diff.indexes.create) {
      statements.push(this.generateCreateIndexSQL(index));
    }

    // Create constraints
    for (const constraint of diff.constraints.create) {
      statements.push(
        `ALTER TABLE ${constraint.table} ADD CONSTRAINT ${constraint.name} ${constraint.definition}`
      );
    }

    // Drop constraints
    for (const constraint of diff.constraints.drop) {
      statements.push(
        `ALTER TABLE ${constraint.table} DROP CONSTRAINT ${constraint.name}`
      );
    }

    // Drop indexes
    for (const index of diff.indexes.drop) {
      statements.push(
        `DROP INDEX ${index.concurrent ? 'CONCURRENTLY ' : ''}${index.name}`
      );
    }

    // Drop tables
    for (const table of diff.tables.drop) {
      statements.push(`DROP TABLE ${table}`);
    }

    return statements;
  }

  /**
   * Generate rollback SQL from schema diff
   */
  generateDownSQL(diff: SchemaDiff): string[] {
    const statements: string[] = [];

    // Reverse of up operations
    // Drop created tables
    for (const table of diff.tables.create) {
      statements.push(`DROP TABLE ${table.name}`);
    }

    // Reverse alterations
    for (const alteration of diff.tables.alter) {
      statements.push(...this.generateReverseAlterTableSQL(alteration));
    }

    // Drop created indexes
    for (const index of diff.indexes.create) {
      statements.push(`DROP INDEX ${index.name}`);
    }

    // Drop created constraints
    for (const constraint of diff.constraints.create) {
      statements.push(
        `ALTER TABLE ${constraint.table} DROP CONSTRAINT ${constraint.name}`
      );
    }

    // Recreate dropped constraints
    for (const constraint of diff.constraints.drop) {
      statements.push(
        `-- TODO: Recreate constraint ${constraint.name}`
      );
    }

    // Recreate dropped indexes
    for (const index of diff.indexes.drop) {
      statements.push(
        `-- TODO: Recreate index ${index.name}`
      );
    }

    // Recreate dropped tables
    for (const table of diff.tables.drop) {
      statements.push(
        `-- TODO: Recreate table ${table}`
      );
    }

    return statements;
  }

  /**
   * Generate CREATE TABLE SQL
   */
  private generateCreateTableSQL(table: TableDefinition): string {
    const columns = table.columns.map(col => {
      const parts = [col.name, col.type];
      
      if (col.nullable === false) {
        parts.push('NOT NULL');
      }
      
      if (col.default !== undefined) {
        parts.push(`DEFAULT ${this.formatDefault(col.default)}`);
      }
      
      if (col.unique) {
        parts.push('UNIQUE');
      }
      
      if (col.references) {
        parts.push(
          `REFERENCES ${col.references.table}(${col.references.column})` +
          (col.references.onDelete ? ` ON DELETE ${col.references.onDelete}` : '') +
          (col.references.onUpdate ? ` ON UPDATE ${col.references.onUpdate}` : '')
        );
      }
      
      return parts.join(' ');
    });

    if (table.primaryKey && table.primaryKey.length > 0) {
      columns.push(`PRIMARY KEY (${table.primaryKey.join(', ')})`);
    }

    let sql = `CREATE TABLE ${table.name} (\n  ${columns.join(',\n  ')}\n)`;

    return sql;
  }

  /**
   * Generate ALTER TABLE SQL
   */
  private generateAlterTableSQL(alteration: TableAlteration): string[] {
    const statements: string[] = [];

    // Add columns
    if (alteration.addColumns) {
      for (const col of alteration.addColumns) {
        const parts = ['ALTER TABLE', alteration.name, 'ADD COLUMN', col.name, col.type];
        
        if (col.nullable === false) {
          parts.push('NOT NULL');
        }
        
        if (col.default !== undefined) {
          parts.push(`DEFAULT ${this.formatDefault(col.default)}`);
        }
        
        statements.push(parts.join(' '));
      }
    }

    // Drop columns
    if (alteration.dropColumns) {
      for (const col of alteration.dropColumns) {
        statements.push(`ALTER TABLE ${alteration.name} DROP COLUMN ${col}`);
      }
    }

    // Alter columns
    if (alteration.alterColumns) {
      for (const col of alteration.alterColumns) {
        if (col.type) {
          statements.push(
            `ALTER TABLE ${alteration.name} ALTER COLUMN ${col.name} TYPE ${col.type}`
          );
        }
        
        if (col.nullable !== undefined) {
          statements.push(
            `ALTER TABLE ${alteration.name} ALTER COLUMN ${col.name} ` +
            (col.nullable ? 'DROP NOT NULL' : 'SET NOT NULL')
          );
        }
        
        if (col.default !== undefined) {
          statements.push(
            `ALTER TABLE ${alteration.name} ALTER COLUMN ${col.name} ` +
            `SET DEFAULT ${this.formatDefault(col.default)}`
          );
        }
        
        if (col.dropDefault) {
          statements.push(
            `ALTER TABLE ${alteration.name} ALTER COLUMN ${col.name} DROP DEFAULT`
          );
        }
      }
    }

    // Rename columns
    if (alteration.renameColumns) {
      for (const rename of alteration.renameColumns) {
        statements.push(
          `ALTER TABLE ${alteration.name} RENAME COLUMN ${rename.from} TO ${rename.to}`
        );
      }
    }

    return statements;
  }

  /**
   * Generate reverse ALTER TABLE SQL
   */
  private generateReverseAlterTableSQL(alteration: TableAlteration): string[] {
    const statements: string[] = [];

    // Drop added columns
    if (alteration.addColumns) {
      for (const col of alteration.addColumns) {
        statements.push(`ALTER TABLE ${alteration.name} DROP COLUMN ${col.name}`);
      }
    }

    // Re-add dropped columns (requires manual intervention)
    if (alteration.dropColumns) {
      for (const col of alteration.dropColumns) {
        statements.push(`-- TODO: Re-add column ${col} to table ${alteration.name}`);
      }
    }

    // Reverse column alterations (requires tracking original state)
    if (alteration.alterColumns) {
      for (const col of alteration.alterColumns) {
        statements.push(`-- TODO: Restore original state of column ${col.name}`);
      }
    }

    // Reverse rename columns
    if (alteration.renameColumns) {
      for (const rename of alteration.renameColumns) {
        statements.push(
          `ALTER TABLE ${alteration.name} RENAME COLUMN ${rename.to} TO ${rename.from}`
        );
      }
    }

    return statements;
  }

  /**
   * Generate CREATE INDEX SQL
   */
  private generateCreateIndexSQL(index: any): string {
    const parts = [
      'CREATE',
      index.unique ? 'UNIQUE' : '',
      'INDEX',
      index.concurrent ? 'CONCURRENTLY' : '',
      index.name,
      'ON',
      index.table,
    ].filter(Boolean);

    if (index.using) {
      parts.push(`USING ${index.using}`);
    }

    parts.push(`(${index.columns.join(', ')})`);

    if (index.where) {
      parts.push(`WHERE ${index.where}`);
    }

    return parts.join(' ');
  }

  /**
   * Generate migration file content
   */
  private generateMigrationFile(migration: Migration, className: string): string {
    const upSQL = Array.isArray(migration.up) 
      ? migration.up.map(s => `    '${s.replace(/'/g, "\\'")}'`).join(',\n')
      : `    '${migration.up.replace(/'/g, "\\'")}'`;

    const downSQL = Array.isArray(migration.down)
      ? migration.down.map(s => `    '${s.replace(/'/g, "\\'")}'`).join(',\n')
      : `    '${migration.down.replace(/'/g, "\\'")}'`;

    return `import type { Migration } from 'hyperion-orm';

export const ${className}: Migration = {
  id: '${migration.id}',
  name: '${migration.name}',
  timestamp: ${migration.timestamp},
  
  up: [
${upSQL}
  ],
  
  down: [
${downSQL}
  ],
  
  // Optional: Set to false to run outside transaction
  transactional: true,
};
`;
  }

  /**
   * Generate schema diff (simplified version)
   */
  private async generateSchemaDiff(schemas: EntitySchema[]): Promise<SchemaDiff> {
    // In a real implementation, this would:
    // 1. Connect to the database
    // 2. Introspect current schema
    // 3. Compare with provided schemas
    // 4. Generate diff
    
    // For now, we'll generate CREATE statements for all schemas
    const tables: TableDefinition[] = schemas.map(schema => ({
      name: schema.tableName || schema.name.toLowerCase() + 's',
      columns: this.schemaToColumns(schema),
      primaryKey: this.getPrimaryKeys(schema),
      indexes: schema.indexes?.map((idx, i) => ({
        name: `idx_${schema.name.toLowerCase()}_${i}`,
        table: schema.tableName || schema.name.toLowerCase() + 's',
        columns: idx.columns as string[],
        unique: idx.unique,
        where: idx.where,
        using: idx.using,
      })),
    }));

    return {
      tables: {
        create: tables,
        drop: [],
        alter: [],
      },
      indexes: {
        create: [],
        drop: [],
      },
      constraints: {
        create: [],
        drop: [],
      },
    };
  }

  /**
   * Convert schema to column definitions
   */
  private schemaToColumns(schema: EntitySchema): ColumnDefinition[] {
    const columns: ColumnDefinition[] = [];

    for (const [name, def] of Object.entries(schema.columns)) {
      const colDef = def as any;
      columns.push({
        name,
        type: this.mapColumnType(colDef.type),
        nullable: colDef.nullable,
        default: colDef.default,
        unique: colDef.unique,
      });
    }

    return columns;
  }

  /**
   * Map column type to SQL type
   */
  private mapColumnType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'VARCHAR(255)',
      'text': 'TEXT',
      'number': 'INTEGER',
      'bigint': 'BIGINT',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'timestamp': 'TIMESTAMP',
      'uuid': 'UUID',
      'json': 'JSONB',
      'decimal': 'DECIMAL',
    };

    return typeMap[type] || 'VARCHAR(255)';
  }

  /**
   * Get primary keys from schema
   */
  private getPrimaryKeys(schema: EntitySchema): string[] {
    const keys: string[] = [];

    for (const [name, def] of Object.entries(schema.columns)) {
      if ((def as any).primary) {
        keys.push(name);
      }
    }

    return keys;
  }

  /**
   * Format default value for SQL
   */
  private formatDefault(value: unknown): string {
    if (typeof value === 'string') {
      if (value === 'now()' || value === 'gen_random_uuid()') {
        return value;
      }
      return `'${value.replace(/'/g, "''")}'`;
    }
    
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    
    if (value === null) {
      return 'NULL';
    }
    
    return String(value);
  }

  /**
   * Ensure migrations directory exists
   */
  private ensureDirectory(): void {
    if (!existsSync(this.directory)) {
      mkdirSync(this.directory, { recursive: true });
    }
  }

  /**
   * Sanitize migration name
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Convert to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[^a-zA-Z0-9]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}