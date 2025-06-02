/**
 * Change tracking system using ES6 Proxy for automatic detection
 * Tracks all modifications to entities for the Unit of Work pattern
 */

import { isObject, deepClone } from '../utils/index.js';

export type ChangeType = 'created' | 'updated' | 'deleted';

export interface EntityChange {
  readonly entity: string;
  readonly id: unknown;
  readonly type: ChangeType;
  readonly originalData?: unknown;
  readonly currentData?: unknown;
  readonly changedFields?: Set<string>;
}

export interface TrackedEntity<T = unknown> {
  readonly entity: string;
  readonly id: unknown;
  readonly data: T;
  readonly proxy: T;
  readonly originalData: T;
  readonly isNew: boolean;
  readonly isDeleted: boolean;
  readonly changedFields: Set<string>;
}

/**
 * Tracks changes to entities using Proxy objects
 */
export class ChangeTracker {
  private readonly trackedEntities = new Map<string, TrackedEntity>();
  private readonly entityProxies = new WeakMap<object, TrackedEntity>();

  /**
   * Start tracking an entity
   */
  track<T extends object>(
    entity: string,
    id: unknown,
    data: T,
    isNew: boolean = false
  ): T {
    const key = this.createKey(entity, id);
    
    // Check if already tracking
    const existing = this.trackedEntities.get(key);
    if (existing) {
      return existing.proxy as T;
    }

    // Clone data to preserve original state
    const originalData = deepClone(data);
    const changedFields = new Set<string>();

    // Create proxy to intercept property changes
    const proxy = this.createProxy(data, changedFields, entity, id);

    const tracked: TrackedEntity<T> = {
      entity,
      id,
      data,
      proxy,
      originalData,
      isNew,
      isDeleted: false,
      changedFields,
    };

    this.trackedEntities.set(key, tracked);
    this.entityProxies.set(proxy, tracked);

    return proxy;
  }

  /**
   * Mark entity as deleted
   */
  markDeleted(entity: string, id: unknown): void {
    const key = this.createKey(entity, id);
    const tracked = this.trackedEntities.get(key);
    
    if (!tracked) {
      throw new Error(`Entity ${entity} with id ${id} is not being tracked`);
    }

    tracked.isDeleted = true;
  }

  /**
   * Get all changes since tracking began
   */
  getChanges(): EntityChange[] {
    const changes: EntityChange[] = [];

    for (const tracked of this.trackedEntities.values()) {
      if (tracked.isDeleted) {
        changes.push({
          entity: tracked.entity,
          id: tracked.id,
          type: 'deleted',
          originalData: tracked.originalData,
        });
      } else if (tracked.isNew) {
        changes.push({
          entity: tracked.entity,
          id: tracked.id,
          type: 'created',
          currentData: tracked.data,
        });
      } else if (tracked.changedFields.size > 0) {
        changes.push({
          entity: tracked.entity,
          id: tracked.id,
          type: 'updated',
          originalData: tracked.originalData,
          currentData: tracked.data,
          changedFields: new Set(tracked.changedFields),
        });
      }
    }

    return changes;
  }

  /**
   * Check if entity has changes
   */
  hasChanges(entity: string, id: unknown): boolean {
    const key = this.createKey(entity, id);
    const tracked = this.trackedEntities.get(key);
    
    if (!tracked) return false;
    
    return tracked.isNew || tracked.isDeleted || tracked.changedFields.size > 0;
  }

  /**
   * Get changed fields for an entity
   */
  getChangedFields(entity: string, id: unknown): Set<string> {
    const key = this.createKey(entity, id);
    const tracked = this.trackedEntities.get(key);
    
    return tracked ? new Set(tracked.changedFields) : new Set();
  }

  /**
   * Reset changes for an entity (after successful save)
   */
  resetChanges(entity: string, id: unknown): void {
    const key = this.createKey(entity, id);
    const tracked = this.trackedEntities.get(key);
    
    if (!tracked) return;

    tracked.originalData = deepClone(tracked.data);
    tracked.changedFields.clear();
    tracked.isNew = false;
    
    if (tracked.isDeleted) {
      this.trackedEntities.delete(key);
    }
  }

  /**
   * Stop tracking an entity
   */
  untrack(entity: string, id: unknown): void {
    const key = this.createKey(entity, id);
    const tracked = this.trackedEntities.get(key);
    
    if (tracked) {
      this.entityProxies.delete(tracked.proxy);
      this.trackedEntities.delete(key);
    }
  }

  /**
   * Clear all tracked entities
   */
  clear(): void {
    this.trackedEntities.clear();
  }

  /**
   * Get statistics about tracked entities
   */
  getStats(): {
    total: number;
    created: number;
    updated: number;
    deleted: number;
    unchanged: number;
  } {
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let unchanged = 0;

    for (const tracked of this.trackedEntities.values()) {
      if (tracked.isDeleted) {
        deleted++;
      } else if (tracked.isNew) {
        created++;
      } else if (tracked.changedFields.size > 0) {
        updated++;
      } else {
        unchanged++;
      }
    }

    return {
      total: this.trackedEntities.size,
      created,
      updated,
      deleted,
      unchanged,
    };
  }

  /**
   * Create a proxy to track changes
   */
  private createProxy<T extends object>(
    target: T,
    changedFields: Set<string>,
    entity: string,
    id: unknown
  ): T {
    const tracker = this;

    return new Proxy(target, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop);
        
        // Don't track symbol properties or internal slots
        if (typeof prop === 'symbol') {
          return value;
        }

        // Return nested proxy for objects and arrays to track deep changes
        if ((isObject(value) || Array.isArray(value)) && !tracker.entityProxies.has(value)) {
          return tracker.createNestedProxy(
            value,
            changedFields,
            String(prop),
            entity,
            id
          );
        }

        return value;
      },

      set(obj, prop, value) {
        // Don't track symbol properties
        if (typeof prop === 'symbol') {
          return Reflect.set(obj, prop, value);
        }

        const propStr = String(prop);
        const oldValue = Reflect.get(obj, prop);

        // Only track if value actually changed
        if (oldValue !== value) {
          changedFields.add(propStr);
          
          // Track nested path for deep objects
          const tracked = tracker.trackedEntities.get(tracker.createKey(entity, id));
          if (tracked && !tracked.isNew) {
            // For updates, we might want to track the specific path
            // This could be enhanced to track deep paths like "address.street"
          }
        }

        return Reflect.set(obj, prop, value);
      },

      deleteProperty(obj, prop) {
        if (typeof prop !== 'symbol') {
          changedFields.add(String(prop));
        }
        return Reflect.deleteProperty(obj, prop);
      },
    });
  }

  /**
   * Create a nested proxy for deep change tracking
   */
  private createNestedProxy<T extends object>(
    target: T,
    changedFields: Set<string>,
    path: string,
    entity: string,
    id: unknown
  ): T {
    const tracker = this;

    return new Proxy(target, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop);
        
        // For array methods that mutate, track changes
        if (Array.isArray(obj) && typeof value === 'function') {
          const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
          if (mutatingMethods.includes(String(prop))) {
            return function(...args: any[]) {
              changedFields.add(path);
              return value.apply(obj, args);
            };
          }
        }

        // Return nested proxy for deep objects
        if (typeof prop !== 'symbol' && (isObject(value) || Array.isArray(value))) {
          return tracker.createNestedProxy(
            value,
            changedFields,
            `${path}.${String(prop)}`,
            entity,
            id
          );
        }

        return value;
      },

      set(obj, prop, value) {
        if (typeof prop !== 'symbol') {
          // Track the full path for nested changes
          changedFields.add(path);
        }
        return Reflect.set(obj, prop, value);
      },

      deleteProperty(obj, prop) {
        if (typeof prop !== 'symbol') {
          changedFields.add(path);
        }
        return Reflect.deleteProperty(obj, prop);
      },
    });
  }

  /**
   * Create a composite key for entity tracking
   */
  private createKey(entity: string, id: unknown): string {
    return `${entity}:${JSON.stringify(id)}`;
  }
}