/**
 * Unit of Work implementation
 * Coordinates entity persistence, manages transactions, and ensures consistency
 */

import { IdentityMap } from './identity-map.js';
import { ChangeTracker, ChangeType, EntityChange } from './change-tracker.js';
import { Connection } from './connection.js';

export interface CommitResult {
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
  readonly duration: number;
}

export interface UnitOfWorkOptions {
  readonly autoFlush?: boolean;
  readonly flushThreshold?: number;
  readonly enableChangeTracking?: boolean;
}

export interface EntityMetadata {
  readonly entity: string;
  readonly table: string;
  readonly primaryKey: string | string[];
  readonly columns: Map<string, string>;
}

/**
 * Coordinates changes to entities and persists them in a single transaction
 */
export class UnitOfWork {
  private readonly identityMap: IdentityMap;
  private readonly changeTracker: ChangeTracker;
  private readonly options: Required<UnitOfWorkOptions>;
  private readonly entityMetadata = new Map<string, EntityMetadata>();
  private connection: Connection | null = null;
  private isActive = true;

  constructor(options: UnitOfWorkOptions = {}) {
    this.identityMap = new IdentityMap();
    this.changeTracker = new ChangeTracker();
    this.options = {
      autoFlush: options.autoFlush ?? false,
      flushThreshold: options.flushThreshold ?? 1000,
      enableChangeTracking: options.enableChangeTracking ?? true,
    };
  }

  /**
   * Register entity metadata for SQL generation
   */
  registerEntity(metadata: EntityMetadata): void {
    this.entityMetadata.set(metadata.entity, metadata);
  }

  /**
   * Set the database connection
   */
  setConnection(connection: Connection): void {
    this.connection = connection;
  }

  /**
   * Get or create an entity instance
   */
  get<T extends object>(entity: string, id: unknown, data?: T): T | undefined {
    this.ensureActive();

    // Check identity map first
    let instance = this.identityMap.get<T>(entity, id);
    
    if (!instance && data) {
      // Create new instance and add to identity map
      instance = this.identityMap.set(entity, id, data);
      
      // Track changes if enabled
      if (this.options.enableChangeTracking) {
        instance = this.changeTracker.track(entity, id, instance, false);
        // Replace the instance in identity map with tracked proxy
        this.identityMap.delete(entity, id);
        this.identityMap.set(entity, id, instance);
      }
    }

    return instance;
  }

  /**
   * Create a new entity
   */
  create<T extends object>(entity: string, data: T): T {
    this.ensureActive();

    // Generate ID if needed (this would be enhanced with proper ID generation)
    const metadata = this.entityMetadata.get(entity);
    if (!metadata) {
      throw new Error(`Entity ${entity} is not registered`);
    }

    // Extract or generate ID
    const id = this.extractId(data, metadata);
    
    // Check if already exists
    const existing = this.identityMap.get<T>(entity, id);
    if (existing) {
      return existing;
    }
    
    // Add to identity map
    const instance = this.identityMap.set(entity, id, data);
    
    // Track as new entity
    if (this.options.enableChangeTracking) {
      const tracked = this.changeTracker.track(entity, id, instance, true);
      // Replace the instance in identity map with tracked proxy
      this.identityMap.delete(entity, id);
      this.identityMap.set(entity, id, tracked);
      return tracked;
    }

    return instance;
  }

  /**
   * Mark entity for deletion
   */
  delete(entity: string, id: unknown): void {
    this.ensureActive();

    if (!this.identityMap.has(entity, id)) {
      throw new Error(`Entity ${entity} with id ${id} is not loaded`);
    }

    this.changeTracker.markDeleted(entity, id);
    
    // Check if we should auto-flush
    this.checkAutoFlush();
  }

  /**
   * Persist an entity (make it managed)
   */
  persist<T extends object>(entity: string, instance: T): T {
    this.ensureActive();

    const metadata = this.entityMetadata.get(entity);
    if (!metadata) {
      throw new Error(`Entity ${entity} is not registered`);
    }

    const id = this.extractId(instance, metadata);
    
    // Add to identity map and track
    const managed = this.identityMap.set(entity, id, instance);
    
    if (this.options.enableChangeTracking) {
      return this.changeTracker.track(entity, id, managed, true);
    }

    return managed;
  }

  /**
   * Get all pending changes
   */
  getChanges(): EntityChange[] {
    return this.changeTracker.getChanges();
  }

  /**
   * Check if there are any pending changes
   */
  hasChanges(): boolean {
    return this.changeTracker.getChanges().length > 0;
  }

  /**
   * Commit all changes to the database
   */
  async commit(): Promise<CommitResult> {
    this.ensureActive();

    if (!this.connection) {
      throw new Error('No database connection set');
    }

    const startTime = Date.now();
    const changes = this.changeTracker.getChanges();
    
    if (changes.length === 0) {
      return {
        created: 0,
        updated: 0,
        deleted: 0,
        duration: 0,
      };
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;

    try {
      // Start transaction
      await this.connection.query('BEGIN');

      // Group changes by type for batch operations
      const creates = changes.filter(c => c.type === 'created');
      const updates = changes.filter(c => c.type === 'updated');
      const deletes = changes.filter(c => c.type === 'deleted');

      // Process deletes first (reverse order of foreign keys)
      for (const change of deletes) {
        await this.executeDelete(change);
        deleted++;
      }

      // Process updates
      for (const change of updates) {
        await this.executeUpdate(change);
        updated++;
      }

      // Process creates last
      for (const change of creates) {
        await this.executeCreate(change);
        created++;
      }

      // Commit transaction
      await this.connection.query('COMMIT');

      // Reset change tracking for successfully persisted entities
      for (const change of changes) {
        this.changeTracker.resetChanges(change.entity, change.id);
        
        if (change.type === 'deleted') {
          this.identityMap.delete(change.entity, change.id);
        }
      }

      const duration = Date.now() - startTime;
      return { created, updated, deleted, duration };

    } catch (error) {
      // Rollback on error
      await this.connection.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Clear all tracked entities and changes
   */
  clear(): void {
    this.identityMap.clear();
    this.changeTracker.clear();
  }

  /**
   * Close the unit of work
   */
  close(): void {
    this.clear();
    this.isActive = false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    identityMap: { entities: number; totalKeys: number };
    changeTracker: {
      total: number;
      created: number;
      updated: number;
      deleted: number;
      unchanged: number;
    };
  } {
    return {
      identityMap: this.identityMap.getStats(),
      changeTracker: this.changeTracker.getStats(),
    };
  }

  /**
   * Ensure unit of work is still active
   */
  private ensureActive(): void {
    if (!this.isActive) {
      throw new Error('Unit of Work has been closed');
    }
  }

  /**
   * Check if we should auto-flush based on threshold
   */
  private checkAutoFlush(): void {
    if (this.options.autoFlush) {
      const changes = this.changeTracker.getChanges().length;
      if (changes >= this.options.flushThreshold) {
        // In a real implementation, we'd queue this as an async operation
        console.warn(`Auto-flush threshold reached: ${changes} changes pending`);
      }
    }
  }

  /**
   * Extract ID from entity data
   */
  private extractId(data: any, metadata: EntityMetadata): unknown {
    const { primaryKey } = metadata;
    
    if (Array.isArray(primaryKey)) {
      // Composite key
      const id: Record<string, unknown> = {};
      for (const key of primaryKey) {
        id[key] = data[key];
      }
      return id;
    }
    
    return data[primaryKey];
  }

  /**
   * Execute CREATE query
   */
  private async executeCreate(change: EntityChange): Promise<void> {
    const metadata = this.entityMetadata.get(change.entity);
    if (!metadata) {
      throw new Error(`No metadata for entity ${change.entity}`);
    }

    const columns: string[] = [];
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    // Build INSERT query
    for (const [prop, column] of metadata.columns) {
      if (prop in (change.currentData as any)) {
        columns.push(column);
        values.push((change.currentData as any)[prop]);
        placeholders.push(`$${paramIndex++}`);
      }
    }

    const sql = `
      INSERT INTO ${metadata.table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    await this.connection!.query(sql, values);
  }

  /**
   * Execute UPDATE query
   */
  private async executeUpdate(change: EntityChange): Promise<void> {
    const metadata = this.entityMetadata.get(change.entity);
    if (!metadata) {
      throw new Error(`No metadata for entity ${change.entity}`);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build SET clause only for changed fields
    if (change.changedFields) {
      for (const field of change.changedFields) {
        const column = metadata.columns.get(field);
        if (column) {
          setClauses.push(`${column} = $${paramIndex++}`);
          values.push((change.currentData as any)[field]);
        }
      }
    }

    if (setClauses.length === 0) return;

    // Add WHERE clause
    const whereClause = this.buildWhereClause(
      change.id,
      metadata,
      values,
      paramIndex
    );

    const sql = `
      UPDATE ${metadata.table}
      SET ${setClauses.join(', ')}
      WHERE ${whereClause}
    `;

    await this.connection!.query(sql, values);
  }

  /**
   * Execute DELETE query
   */
  private async executeDelete(change: EntityChange): Promise<void> {
    const metadata = this.entityMetadata.get(change.entity);
    if (!metadata) {
      throw new Error(`No metadata for entity ${change.entity}`);
    }

    const values: unknown[] = [];
    const whereClause = this.buildWhereClause(
      change.id,
      metadata,
      values,
      1
    );

    const sql = `DELETE FROM ${metadata.table} WHERE ${whereClause}`;
    await this.connection!.query(sql, values);
  }

  /**
   * Build WHERE clause for primary key
   */
  private buildWhereClause(
    id: unknown,
    metadata: EntityMetadata,
    values: unknown[],
    startIndex: number
  ): string {
    const { primaryKey, columns } = metadata;
    
    if (Array.isArray(primaryKey)) {
      // Composite key
      const conditions: string[] = [];
      let paramIndex = startIndex;
      
      for (const key of primaryKey) {
        const column = columns.get(key);
        if (column) {
          conditions.push(`${column} = $${paramIndex++}`);
          values.push((id as any)[key]);
        }
      }
      
      return conditions.join(' AND ');
    }
    
    // Single key
    const column = columns.get(primaryKey);
    values.push(id);
    return `${column} = $${startIndex}`;
  }
}