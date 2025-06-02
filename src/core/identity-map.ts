/**
 * Identity Map implementation using WeakMap for automatic garbage collection
 * Ensures that only one instance of an entity exists in memory at a time
 */

import { isObject } from '../utils/index.js';

export interface EntityKey {
  readonly entity: string;
  readonly id: unknown;
}

export interface IdentityMapOptions {
  readonly enableWeakRefs?: boolean;
}

/**
 * Thread-safe Identity Map implementation
 * Uses composite key (entity type + id) to ensure uniqueness across entity types
 */
export class IdentityMap {
  private readonly maps = new Map<string, WeakMap<object, unknown>>();
  private readonly keyRegistry = new Map<string, WeakRef<object>>();
  private readonly options: Required<IdentityMapOptions>;

  constructor(options: IdentityMapOptions = {}) {
    this.options = {
      enableWeakRefs: options.enableWeakRefs ?? true,
    };
  }

  /**
   * Get entity from identity map
   */
  get<T>(entity: string, id: unknown): T | undefined {
    const map = this.maps.get(entity);
    if (!map) return undefined;

    const keyObj = this.getKeyObject(entity, id);
    if (!keyObj) return undefined;

    return map.get(keyObj) as T | undefined;
  }

  /**
   * Store entity in identity map
   * Returns the existing entity if already present
   */
  set<T extends object>(entity: string, id: unknown, instance: T): T {
    // Ensure we have a map for this entity type
    let map = this.maps.get(entity);
    if (!map) {
      map = new WeakMap();
      this.maps.set(entity, map);
    }

    // Get or create key object
    const keyObj = this.getOrCreateKeyObject(entity, id);
    
    // Check if entity already exists
    const existing = map.get(keyObj);
    if (existing) {
      return existing as T;
    }

    // Store new entity
    map.set(keyObj, instance);
    return instance;
  }

  /**
   * Remove entity from identity map
   */
  delete(entity: string, id: unknown): boolean {
    const map = this.maps.get(entity);
    if (!map) return false;

    const keyObj = this.getKeyObject(entity, id);
    if (!keyObj) return false;

    const result = map.delete(keyObj);
    
    // Clean up key registry
    const compositeKey = this.createCompositeKey(entity, id);
    this.keyRegistry.delete(compositeKey);
    
    return result;
  }

  /**
   * Check if entity exists in identity map
   */
  has(entity: string, id: unknown): boolean {
    const map = this.maps.get(entity);
    if (!map) return false;

    const keyObj = this.getKeyObject(entity, id);
    if (!keyObj) return false;

    return map.has(keyObj);
  }

  /**
   * Clear all entities of a specific type
   */
  clearEntity(entity: string): void {
    this.maps.delete(entity);
    
    // Clean up key registry for this entity type
    for (const [key] of this.keyRegistry) {
      if (key.startsWith(`${entity}:`)) {
        this.keyRegistry.delete(key);
      }
    }
  }

  /**
   * Clear entire identity map
   */
  clear(): void {
    this.maps.clear();
    this.keyRegistry.clear();
  }

  /**
   * Get statistics about the identity map
   */
  getStats(): { entities: number; totalKeys: number } {
    let totalKeys = 0;
    
    // Count active weak refs
    for (const [, weakRef] of this.keyRegistry) {
      if (weakRef.deref() !== undefined) {
        totalKeys++;
      }
    }

    // Clean up dead weak refs while we're at it
    this.cleanupDeadRefs();

    return {
      entities: this.maps.size,
      totalKeys,
    };
  }

  /**
   * Create a composite key from entity type and id
   */
  private createCompositeKey(entity: string, id: unknown): string {
    if (id === null || id === undefined) {
      throw new Error(`Invalid ID for entity ${entity}: ${id}`);
    }

    // Handle different ID types
    if (typeof id === 'object') {
      // For composite keys, create a stable string representation
      return `${entity}:obj:${JSON.stringify(this.sortObjectKeys(id))}`;
    }
    
    // Preserve type information in the key
    const typePrefix = typeof id;
    return `${entity}:${typePrefix}:${String(id)}`;
  }

  /**
   * Sort object keys for stable stringification
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (!isObject(obj)) return obj;
    
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObjectKeys(obj[key]);
    }
    
    return sorted;
  }

  /**
   * Get key object from registry
   */
  private getKeyObject(entity: string, id: unknown): object | undefined {
    const compositeKey = this.createCompositeKey(entity, id);
    const weakRef = this.keyRegistry.get(compositeKey);
    
    if (!weakRef) return undefined;
    
    const keyObj = weakRef.deref();
    if (!keyObj) {
      // Clean up dead reference
      this.keyRegistry.delete(compositeKey);
      return undefined;
    }
    
    return keyObj;
  }

  /**
   * Get or create key object for entity
   */
  private getOrCreateKeyObject(entity: string, id: unknown): object {
    const existing = this.getKeyObject(entity, id);
    if (existing) return existing;

    // Create new key object
    const keyObj = { entity, id };
    const compositeKey = this.createCompositeKey(entity, id);
    
    if (this.options.enableWeakRefs) {
      this.keyRegistry.set(compositeKey, new WeakRef(keyObj));
    }
    
    return keyObj;
  }

  /**
   * Clean up dead weak references
   */
  private cleanupDeadRefs(): void {
    if (!this.options.enableWeakRefs) return;

    for (const [key, weakRef] of this.keyRegistry) {
      if (weakRef.deref() === undefined) {
        this.keyRegistry.delete(key);
      }
    }
  }
}