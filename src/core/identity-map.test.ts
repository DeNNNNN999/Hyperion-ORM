import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityMap } from './identity-map.js';

interface TestUser {
  id: number;
  name: string;
  email: string;
}

interface TestPost {
  id: string;
  title: string;
  authorId: number;
}

describe('IdentityMap', () => {
  let identityMap: IdentityMap;

  beforeEach(() => {
    identityMap = new IdentityMap();
  });

  describe('basic operations', () => {
    it('should store and retrieve entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      
      identityMap.set('User', user.id, user);
      const retrieved = identityMap.get<TestUser>('User', 1);
      
      expect(retrieved).toBe(user); // Same reference
      expect(retrieved).toEqual(user);
    });

    it('should return undefined for non-existent entities', () => {
      const retrieved = identityMap.get('User', 999);
      expect(retrieved).toBeUndefined();
    });

    it('should maintain separate maps for different entity types', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const post: TestPost = { id: '1', title: 'Hello', authorId: 1 };
      
      identityMap.set('User', user.id, user);
      identityMap.set('Post', post.id, post);
      
      expect(identityMap.get<TestUser>('User', 1)).toBe(user);
      expect(identityMap.get<TestPost>('Post', '1')).toBe(post);
      expect(identityMap.get('User', '1')).toBeUndefined();
      expect(identityMap.get('Post', 1)).toBeUndefined();
    });
  });

  describe('identity guarantee', () => {
    it('should return the same instance for the same entity', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 1, name: 'John Updated', email: 'john2@example.com' };
      
      const stored1 = identityMap.set('User', 1, user1);
      const stored2 = identityMap.set('User', 1, user2);
      
      expect(stored1).toBe(user1);
      expect(stored2).toBe(user1); // Returns existing instance, not user2
      expect(stored2).not.toBe(user2);
    });

    it('should handle composite keys correctly', () => {
      const compositeKey = { tenantId: 1, userId: 100 };
      const user: TestUser = { id: 100, name: 'John', email: 'john@example.com' };
      
      identityMap.set('TenantUser', compositeKey, user);
      
      // Same composite key should return same instance
      const retrieved1 = identityMap.get('TenantUser', { tenantId: 1, userId: 100 });
      const retrieved2 = identityMap.get('TenantUser', { userId: 100, tenantId: 1 }); // Different order
      
      expect(retrieved1).toBe(user);
      expect(retrieved2).toBe(user); // Should handle key order
    });
  });

  describe('deletion operations', () => {
    it('should delete entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      
      identityMap.set('User', 1, user);
      expect(identityMap.has('User', 1)).toBe(true);
      
      const deleted = identityMap.delete('User', 1);
      expect(deleted).toBe(true);
      expect(identityMap.has('User', 1)).toBe(false);
      expect(identityMap.get('User', 1)).toBeUndefined();
    });

    it('should return false when deleting non-existent entity', () => {
      const deleted = identityMap.delete('User', 999);
      expect(deleted).toBe(false);
    });

    it('should clear all entities of a specific type', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      const post: TestPost = { id: '1', title: 'Hello', authorId: 1 };
      
      identityMap.set('User', 1, user1);
      identityMap.set('User', 2, user2);
      identityMap.set('Post', '1', post);
      
      identityMap.clearEntity('User');
      
      expect(identityMap.has('User', 1)).toBe(false);
      expect(identityMap.has('User', 2)).toBe(false);
      expect(identityMap.has('Post', '1')).toBe(true);
    });

    it('should clear entire identity map', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const post: TestPost = { id: '1', title: 'Hello', authorId: 1 };
      
      identityMap.set('User', 1, user);
      identityMap.set('Post', '1', post);
      
      identityMap.clear();
      
      expect(identityMap.has('User', 1)).toBe(false);
      expect(identityMap.has('Post', '1')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined IDs with proper errors', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      
      expect(() => identityMap.set('User', null, user)).toThrow('Invalid ID');
      expect(() => identityMap.set('User', undefined, user)).toThrow('Invalid ID');
    });

    it('should handle string vs number IDs as different', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 1, name: 'Jane', email: 'jane@example.com' };
      
      identityMap.set('User', 1, user1);
      identityMap.set('User', '1', user2);
      
      expect(identityMap.get('User', 1)).toBe(user1);
      expect(identityMap.get('User', '1')).toBe(user2);
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      const post: TestPost = { id: '1', title: 'Hello', authorId: 1 };
      
      identityMap.set('User', 1, user1);
      identityMap.set('User', 2, user2);
      identityMap.set('Post', '1', post);
      
      const stats = identityMap.getStats();
      expect(stats.entities).toBe(2); // User and Post
      expect(stats.totalKeys).toBe(3); // 2 users + 1 post
    });
  });

  describe('memory efficiency', () => {
    it('should allow garbage collection with WeakMap', () => {
      // This test is more conceptual - in real usage, when no references
      // to the key object exist, the WeakMap allows GC
      const identityMapWithWeakRefs = new IdentityMap({ enableWeakRefs: true });
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      
      identityMapWithWeakRefs.set('User', 1, user);
      expect(identityMapWithWeakRefs.get('User', 1)).toBe(user);
      
      // In production, when all references to the key are gone,
      // WeakMap allows the entry to be garbage collected
    });
  });
});