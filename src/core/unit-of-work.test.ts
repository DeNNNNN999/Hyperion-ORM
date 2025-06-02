import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnitOfWork } from './unit-of-work.js';
import { Connection } from './connection.js';

// Mock connection
const mockConnection = {
  query: vi.fn(),
} as unknown as Connection;

interface TestUser {
  id: number;
  name: string;
  email: string;
  age?: number;
}

describe('UnitOfWork', () => {
  let uow: UnitOfWork;

  beforeEach(() => {
    uow = new UnitOfWork();
    uow.setConnection(mockConnection);
    
    // Register test entity
    uow.registerEntity({
      entity: 'User',
      table: 'users',
      primaryKey: 'id',
      columns: new Map([
        ['id', 'id'],
        ['name', 'name'],
        ['email', 'email'],
        ['age', 'age'],
      ]),
    });

    // Reset mock
    vi.clearAllMocks();
  });

  describe('entity management', () => {
    it('should create and track new entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const tracked = uow.create('User', user);
      
      expect(tracked).toEqual(user);
      expect(uow.hasChanges()).toBe(true);
      
      const changes = uow.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entity: 'User',
        id: 1,
        type: 'created',
        currentData: user,
      });
    });

    it('should use identity map to return same instance', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const tracked1 = uow.create('User', user);
      
      // Try to create the same entity again - should return existing
      const user2: TestUser = { id: 1, name: 'Different Name', email: 'different@example.com' };
      const tracked2 = uow.create('User', user2);
      
      // Should return the original tracked instance
      expect(tracked2).toBe(tracked1);
      expect(tracked2.name).toBe('John'); // Original data preserved
      
      // Get should also return the same instance
      const tracked3 = uow.get('User', 1);
      expect(tracked3).toBe(tracked1);
    });

    it('should track updates to existing entities', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const tracked = uow.get('User', 1, user)!;
      
      // Initially no changes
      expect(uow.hasChanges()).toBe(false);
      
      // Modify entity
      tracked.name = 'Jane';
      tracked.email = 'jane@example.com';
      
      expect(uow.hasChanges()).toBe(true);
      
      const changes = uow.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entity: 'User',
        id: 1,
        type: 'updated',
        changedFields: new Set(['name', 'email']),
      });
    });

    it('should track deletions', () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      uow.get('User', 1, user);
      
      uow.delete('User', 1);
      
      const changes = uow.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        entity: 'User',
        id: 1,
        type: 'deleted',
      });
    });
  });

  describe('commit operations', () => {
    it('should commit created entities', async () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      uow.create('User', user);
      
      const result = await uow.commit();
      
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      
      // Verify SQL calls
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([1, 'John', 'john@example.com'])
      );
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
      
      // After commit, no changes should remain
      expect(uow.hasChanges()).toBe(false);
    });

    it('should commit updates with only changed fields', async () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com', age: 30 };
      const tracked = uow.get('User', 1, user)!;
      
      // Only change name
      tracked.name = 'Jane';
      
      const result = await uow.commit();
      
      expect(result.updated).toBe(1);
      
      // Should only update changed field
      const updateCall = mockConnection.query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE')
      );
      
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain('name = $1');
      expect(updateCall![0]).not.toContain('email');
      expect(updateCall![0]).not.toContain('age');
      expect(updateCall![1]).toEqual(['Jane', 1]);
    });

    it('should commit deletions', async () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      uow.get('User', 1, user);
      uow.delete('User', 1);
      
      const result = await uow.commit();
      
      expect(result.deleted).toBe(1);
      
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM users WHERE id = $1'),
        [1]
      );
    });

    it('should handle multiple operations in correct order', async () => {
      // Create
      const newUser: TestUser = { id: 2, name: 'New', email: 'new@example.com' };
      uow.create('User', newUser);
      
      // Update
      const existingUser: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const tracked = uow.get('User', 1, existingUser)!;
      tracked.name = 'Updated';
      
      // Delete
      const toDelete: TestUser = { id: 3, name: 'Delete', email: 'delete@example.com' };
      uow.get('User', 3, toDelete);
      uow.delete('User', 3);
      
      const result = await uow.commit();
      
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(1);
      
      // Verify order: DELETE -> UPDATE -> INSERT
      const queries = mockConnection.query.mock.calls
        .map(call => call[0])
        .filter(q => typeof q === 'string');
      
      const deleteIndex = queries.findIndex(q => q.includes('DELETE'));
      const updateIndex = queries.findIndex(q => q.includes('UPDATE'));
      const insertIndex = queries.findIndex(q => q.includes('INSERT'));
      
      expect(deleteIndex).toBeLessThan(updateIndex);
      expect(updateIndex).toBeLessThan(insertIndex);
    });

    it('should rollback on error', async () => {
      const user: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      uow.create('User', user);
      
      // Make query fail
      mockConnection.query.mockRejectedValueOnce(new Error('DB Error'));
      
      await expect(uow.commit()).rejects.toThrow('DB Error');
      
      // Should have called ROLLBACK
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
      
      // Changes should still be pending
      expect(uow.hasChanges()).toBe(true);
    });

    it('should handle empty commits', async () => {
      const result = await uow.commit();
      
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.duration).toBe(0);
      
      // Should not start transaction for empty commits
      expect(mockConnection.query).not.toHaveBeenCalled();
    });
  });

  describe('composite keys', () => {
    beforeEach(() => {
      // Register entity with composite key
      uow.registerEntity({
        entity: 'TenantUser',
        table: 'tenant_users',
        primaryKey: ['tenantId', 'userId'],
        columns: new Map([
          ['tenantId', 'tenant_id'],
          ['userId', 'user_id'],
          ['role', 'role'],
        ]),
      });
    });

    it('should handle composite keys in queries', async () => {
      const tenantUser = { tenantId: 1, userId: 100, role: 'admin' };
      const tracked = uow.get('TenantUser', { tenantId: 1, userId: 100 }, tenantUser)!;
      
      tracked.role = 'user';
      
      await uow.commit();
      
      const updateCall = mockConnection.query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE')
      );
      
      expect(updateCall![0]).toContain('tenant_id = $2 AND user_id = $3');
      expect(updateCall![1]).toEqual(['user', 1, 100]);
    });
  });

  describe('lifecycle management', () => {
    it('should clear all entities', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      
      uow.create('User', user1);
      uow.create('User', user2);
      
      expect(uow.hasChanges()).toBe(true);
      
      uow.clear();
      
      expect(uow.hasChanges()).toBe(false);
      expect(uow.get('User', 1)).toBeUndefined();
      expect(uow.get('User', 2)).toBeUndefined();
    });

    it('should prevent operations after close', () => {
      uow.close();
      
      expect(() => {
        uow.create('User', { id: 1, name: 'John', email: 'john@example.com' });
      }).toThrow('Unit of Work has been closed');
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', () => {
      const user1: TestUser = { id: 1, name: 'John', email: 'john@example.com' };
      const user2: TestUser = { id: 2, name: 'Jane', email: 'jane@example.com' };
      
      uow.create('User', user1);
      const tracked = uow.get('User', 2, user2)!;
      tracked.name = 'Jane Updated';
      
      const stats = uow.getStats();
      
      expect(stats.changeTracker.total).toBe(2);
      expect(stats.changeTracker.created).toBe(1);
      expect(stats.changeTracker.updated).toBe(1);
      expect(stats.changeTracker.deleted).toBe(0);
      expect(stats.identityMap.totalKeys).toBe(2);
    });
  });
});