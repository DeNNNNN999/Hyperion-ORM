import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeTracker } from './change-tracker.js';

interface TestUser {
  id: number;
  name: string;
  email: string;
  address?: {
    street: string;
    city: string;
  };
}

describe('ChangeTracker', () => {
  let tracker: ChangeTracker;

  beforeEach(() => {
    tracker = new ChangeTracker();
  });

  describe('basic tracking', () => {
    it('should track new entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const proxy = tracker.track('User', 1, user, true);
      
      expect(proxy).toEqual(user);
      expect(tracker.hasChanges('User', 1)).toBe(true);
      
      const changes = tracker.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entity: 'User',
        id: 1,
        type: 'created',
        currentData: user,
      });
    });

    it('should not report changes for unmodified existing entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      tracker.track('User', 1, user, false);
      
      expect(tracker.hasChanges('User', 1)).toBe(false);
      expect(tracker.getChanges()).toHaveLength(0);
    });

    it('should track property changes', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const proxy = tracker.track('User', 1, user, false);
      
      proxy.name = 'Jane';
      proxy.email = 'jane@example.com';
      
      expect(tracker.hasChanges('User', 1)).toBe(true);
      
      const changedFields = tracker.getChangedFields('User', 1);
      expect(changedFields).toEqual(new Set(['name', 'email']));
      
      const changes = tracker.getChanges();
      expect(changes[0]).toMatchObject({
        entity: 'User',
        id: 1,
        type: 'updated',
        changedFields: new Set(['name', 'email']),
      });
    });

    it('should not track changes when setting same value', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const proxy = tracker.track('User', 1, user, false);
      
      proxy.name = 'John'; // Same value
      
      expect(tracker.hasChanges('User', 1)).toBe(false);
    });
  });

  describe('nested object tracking', () => {
    it('should track changes to nested objects', () => {
      const user: TestUser = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        address: {
          street: '123 Main St',
          city: 'Boston',
        },
      };
      
      const proxy = tracker.track('User', 1, user, false);
      
      proxy.address!.city = 'New York';
      
      expect(tracker.hasChanges('User', 1)).toBe(true);
      
      const changedFields = tracker.getChangedFields('User', 1);
      expect(changedFields).toContain('address');
    });

    it('should track when nested object is replaced', () => {
      const user: TestUser = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        address: {
          street: '123 Main St',
          city: 'Boston',
        },
      };
      
      const proxy = tracker.track('User', 1, user, false);
      
      proxy.address = {
        street: '456 Oak Ave',
        city: 'Chicago',
      };
      
      const changedFields = tracker.getChangedFields('User', 1);
      expect(changedFields).toEqual(new Set(['address']));
    });
  });

  describe('deletion tracking', () => {
    it('should track deletions', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      tracker.track('User', 1, user, false);
      
      tracker.markDeleted('User', 1);
      
      expect(tracker.hasChanges('User', 1)).toBe(true);
      
      const changes = tracker.getChanges();
      expect(changes[0]).toMatchObject({
        entity: 'User',
        id: 1,
        type: 'deleted',
        originalData: user,
      });
    });

    it('should throw when marking non-tracked entity as deleted', () => {
      expect(() => {
        tracker.markDeleted('User', 999);
      }).toThrow('Entity User with id 999 is not being tracked');
    });
  });

  describe('proxy behavior', () => {
    it('should track property deletion', () => {
      const user: TestUser = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        address: { street: '123 Main', city: 'Boston' },
      };
      const proxy = tracker.track('User', 1, user, false);
      
      delete proxy.address;
      
      const changedFields = tracker.getChangedFields('User', 1);
      expect(changedFields).toContain('address');
    });

    it('should return same proxy for multiple track calls', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      
      const proxy1 = tracker.track('User', 1, user, false);
      const proxy2 = tracker.track('User', 1, user, false);
      
      expect(proxy1).toBe(proxy2);
    });

    it('should not track symbol properties', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const proxy = tracker.track('User', 1, user, false);
      
      const sym = Symbol('test');
      (proxy as any)[sym] = 'value';
      
      expect(tracker.hasChanges('User', 1)).toBe(false);
    });
  });

  describe('change management', () => {
    it('should reset changes after commit', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const proxy = tracker.track('User', 1, user, false);
      
      proxy.name = 'Jane';
      expect(tracker.hasChanges('User', 1)).toBe(true);
      
      tracker.resetChanges('User', 1);
      
      expect(tracker.hasChanges('User', 1)).toBe(false);
      expect(proxy.name).toBe('Jane'); // Value stays changed
      
      // Further changes should be tracked from new baseline
      proxy.email = 'jane@example.com';
      
      const changes = tracker.getChanges();
      expect(changes[0].changedFields).toEqual(new Set(['email']));
    });

    it('should remove deleted entities after reset', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      tracker.track('User', 1, user, false);
      tracker.markDeleted('User', 1);
      
      tracker.resetChanges('User', 1);
      
      expect(tracker.hasChanges('User', 1)).toBe(false);
      expect(tracker.getChanges()).toHaveLength(0);
    });

    it('should untrack entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const proxy = tracker.track('User', 1, user, false);
      
      tracker.untrack('User', 1);
      
      // Changes after untracking should not be recorded
      proxy.name = 'Jane';
      
      expect(tracker.hasChanges('User', 1)).toBe(false);
      expect(tracker.getChanges()).toHaveLength(0);
    });

    it('should clear all tracked entities', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      
      tracker.track('User', 1, user1, true);
      tracker.track('User', 2, user2, false);
      
      tracker.clear();
      
      expect(tracker.getChanges()).toHaveLength(0);
      expect(tracker.getStats().total).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', () => {
      // New entity
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      tracker.track('User', 1, user1, true);
      
      // Updated entity
      const user2: TestUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      const proxy2 = tracker.track('User', 2, user2, false);
      proxy2.name = 'Jane Updated';
      
      // Deleted entity
      const user3: TestUser = { id: 3, name: 'Bob', email: 'bob@example.com' };
      tracker.track('User', 3, user3, false);
      tracker.markDeleted('User', 3);
      
      // Unchanged entity
      const user4: TestUser = { id: 4, name: 'Alice', email: 'alice@example.com' };
      tracker.track('User', 4, user4, false);
      
      const stats = tracker.getStats();
      
      expect(stats.total).toBe(4);
      expect(stats.created).toBe(1);
      expect(stats.updated).toBe(1);
      expect(stats.deleted).toBe(1);
      expect(stats.unchanged).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle arrays and complex objects', () => {
      const data = {
        id: 1,
        tags: ['tag1', 'tag2'],
        metadata: {
          nested: {
            deep: {
              value: 'original',
            },
          },
        },
      };
      
      const proxy = tracker.track('Entity', 1, data, false);
      
      // Modify array
      proxy.tags.push('tag3');
      
      // Modify deep nested value
      proxy.metadata.nested.deep.value = 'modified';
      
      expect(tracker.hasChanges('Entity', 1)).toBe(true);
      
      const changedFields = tracker.getChangedFields('Entity', 1);
      expect(changedFields).toContain('tags');
      // Deep changes are tracked with full path
      expect(changedFields).toContain('metadata.nested.deep');
    });

    it('should handle circular references safely', () => {
      const user: any = { id: 1, name: 'John' };
      user.self = user; // Circular reference
      
      // Should not throw
      const proxy = tracker.track('User', 1, user, false);
      proxy.name = 'Jane';
      
      expect(tracker.hasChanges('User', 1)).toBe(true);
    });
  });
});