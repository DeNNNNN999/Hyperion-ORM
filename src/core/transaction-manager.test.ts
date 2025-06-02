import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionManager, withTransaction, Transactional } from './transaction-manager.js';
import type { Connection } from './connection.js';

// Mock connection
const mockConnection = {
  query: vi.fn(),
} as unknown as Connection;

describe('TransactionManager', () => {
  let manager: TransactionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new TransactionManager(mockConnection);
    
    // Setup default mock responses
    mockConnection.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('basic transactions', () => {
    it('should execute simple transaction', async () => {
      const callback = vi.fn().mockResolvedValue('success');
      
      const result = await manager.withTransaction(callback);
      
      expect(result.result).toBe('success');
      expect(result.retries).toBe(0);
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.stringMatching(/^tx_\d+$/),
        level: 0,
      }));
    });

    it('should rollback on error', async () => {
      const error = new Error('Transaction failed');
      const callback = vi.fn().mockRejectedValue(error);
      
      await expect(manager.withTransaction(callback)).rejects.toThrow('Transaction failed');
      
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should support isolation levels', async () => {
      const callback = vi.fn().mockResolvedValue('success');
      
      await manager.withTransaction(callback, { 
        isolationLevel: 'SERIALIZABLE' 
      });
      
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should support read-only transactions', async () => {
      const callback = vi.fn().mockResolvedValue('success');
      
      await manager.withTransaction(callback, { 
        readOnly: true 
      });
      
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should support deferrable transactions', async () => {
      const callback = vi.fn().mockResolvedValue('success');
      
      await manager.withTransaction(callback, { 
        readOnly: true,
        deferrable: true 
      });
      
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
      expect(mockConnection.query).toHaveBeenCalledWith('SET TRANSACTION DEFERRABLE');
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('nested transactions', () => {
    it('should handle nested transactions with savepoints', async () => {
      const outerCallback = vi.fn().mockImplementation(async (tx) => {
        const innerCallback = vi.fn().mockResolvedValue('inner success');
        
        return manager.withTransaction(innerCallback);
      });
      
      const result = await manager.withTransaction(outerCallback);
      
      expect(result.result.result).toBe('inner success');
      
      // Should use savepoints for nested transaction
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('SAVEPOINT sp_level_1');
      expect(mockConnection.query).toHaveBeenCalledWith('RELEASE SAVEPOINT sp_level_1');
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback nested transaction on error', async () => {
      const outerCallback = vi.fn().mockImplementation(async (tx) => {
        const innerCallback = vi.fn().mockRejectedValue(new Error('Inner failed'));
        
        try {
          await manager.withTransaction(innerCallback);
        } catch (error) {
          // Handle inner error and continue
          return 'recovered';
        }
      });
      
      const result = await manager.withTransaction(outerCallback);
      
      expect(result.result).toBe('recovered');
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
      expect(mockConnection.query).toHaveBeenCalledWith('SAVEPOINT sp_level_1');
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT sp_level_1');
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('savepoints', () => {
    it('should create and release savepoints', async () => {
      let transactionId: string;
      
      const callback = vi.fn().mockImplementation(async (tx) => {
        transactionId = tx.id;
        
        const savepoint = await manager.createSavepoint(tx.id, 'test_savepoint');
        expect(savepoint).toBe('test_savepoint');
        
        await manager.releaseSavepoint(tx.id, 'test_savepoint');
        
        return 'success';
      });
      
      await manager.withTransaction(callback);
      
      expect(mockConnection.query).toHaveBeenCalledWith('SAVEPOINT test_savepoint');
      expect(mockConnection.query).toHaveBeenCalledWith('RELEASE SAVEPOINT test_savepoint');
    });

    it('should rollback to savepoint', async () => {
      let transactionId: string;
      
      const callback = vi.fn().mockImplementation(async (tx) => {
        transactionId = tx.id;
        
        const savepoint = await manager.createSavepoint(tx.id, 'before_error');
        
        // Simulate some work that needs to be rolled back
        try {
          throw new Error('Something went wrong');
        } catch (error) {
          await manager.rollbackToSavepoint(tx.id, 'before_error');
        }
        
        return 'recovered';
      });
      
      await manager.withTransaction(callback);
      
      expect(mockConnection.query).toHaveBeenCalledWith('SAVEPOINT before_error');
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT before_error');
    });

    it('should auto-generate savepoint names', async () => {
      const callback = vi.fn().mockImplementation(async (tx) => {
        const savepoint1 = await manager.createSavepoint(tx.id);
        const savepoint2 = await manager.createSavepoint(tx.id);
        
        expect(savepoint1).toMatch(/^sp_\d+$/);
        expect(savepoint2).toMatch(/^sp_\d+$/);
        expect(savepoint1).not.toBe(savepoint2);
        
        return 'success';
      });
      
      await manager.withTransaction(callback);
    });

    it('should error on invalid savepoint operations', async () => {
      await expect(
        manager.createSavepoint('invalid_tx_id', 'test')
      ).rejects.toThrow('No active transaction found');
      
      await expect(
        manager.rollbackToSavepoint('invalid_tx_id', 'test')
      ).rejects.toThrow('No active transaction found');
      
      const callback = vi.fn().mockImplementation(async (tx) => {
        await expect(
          manager.rollbackToSavepoint(tx.id, 'nonexistent')
        ).rejects.toThrow('Savepoint not found');
        
        return 'success';
      });
      
      await manager.withTransaction(callback);
    });
  });

  describe('deadlock handling', () => {
    it('should retry on deadlock', async () => {
      let attempts = 0;
      const callback = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Deadlock detected') as any;
          error.code = '40P01'; // PostgreSQL deadlock code
          throw error;
        }
        return 'success after retries';
      });
      
      const result = await manager.withTransaction(callback, {
        retryOnDeadlock: true,
        maxRetries: 3,
        retryDelay: 10,
      });
      
      expect(result.result).toBe('success after retries');
      expect(result.retries).toBe(2);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const callback = vi.fn().mockImplementation(async () => {
        const error = new Error('Persistent deadlock') as any;
        error.code = '40P01';
        throw error;
      });
      
      await expect(manager.withTransaction(callback, {
        retryOnDeadlock: true,
        maxRetries: 2,
        retryDelay: 1,
      })).rejects.toThrow('Persistent deadlock');
      
      expect(callback).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-deadlock errors', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Regular error'));
      
      await expect(manager.withTransaction(callback, {
        retryOnDeadlock: true,
        maxRetries: 3,
      })).rejects.toThrow('Regular error');
      
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running transactions', async () => {
      const callback = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'should not complete';
      });
      
      await expect(manager.withTransaction(callback, {
        timeout: 100,
      })).rejects.toThrow('Transaction timeout');
      
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('transaction management', () => {
    it('should track active transactions', async () => {
      expect(manager.hasActiveTransactions()).toBe(false);
      expect(manager.getActiveTransactions()).toHaveLength(0);
      
      const callback = vi.fn().mockImplementation(async (tx) => {
        expect(manager.hasActiveTransactions()).toBe(true);
        expect(manager.getActiveTransactions()).toHaveLength(1);
        expect(manager.getTransaction(tx.id)).toBeDefined();
        
        return 'success';
      });
      
      await manager.withTransaction(callback);
      
      expect(manager.hasActiveTransactions()).toBe(false);
      expect(manager.getActiveTransactions()).toHaveLength(0);
    });

    it('should force rollback all transactions', async () => {
      // Start multiple transactions
      const longRunningCallback = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'should not complete';
      });
      
      // Start transaction but don't await it
      const txPromise = manager.withTransaction(longRunningCallback);
      
      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(manager.hasActiveTransactions()).toBe(true);
      
      // Force rollback all
      await manager.rollbackAll();
      
      // Transaction should be rolled back
      await expect(txPromise).rejects.toThrow();
      expect(manager.hasActiveTransactions()).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit transaction events', async () => {
      const startedHandler = vi.fn();
      const committedHandler = vi.fn();
      
      manager.on('transactionStarted', startedHandler);
      manager.on('transactionCommitted', committedHandler);
      
      const callback = vi.fn().mockResolvedValue('success');
      
      await manager.withTransaction(callback);
      
      expect(startedHandler).toHaveBeenCalledWith(expect.objectContaining({
        transactionId: expect.stringMatching(/^tx_\d+$/),
        level: 0,
        attempt: 1,
      }));
      
      expect(committedHandler).toHaveBeenCalledWith(expect.objectContaining({
        transactionId: expect.stringMatching(/^tx_\d+$/),
        duration: expect.any(Number),
        savepoints: 0,
      }));
    });

    it('should emit rollback events', async () => {
      const rolledBackHandler = vi.fn();
      manager.on('transactionRolledBack', rolledBackHandler);
      
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(manager.withTransaction(callback)).rejects.toThrow('Test error');
      
      expect(rolledBackHandler).toHaveBeenCalledWith(expect.objectContaining({
        transactionId: expect.stringMatching(/^tx_\d+$/),
        error: expect.any(Error),
        attempt: 1,
      }));
    });

    it('should emit savepoint events', async () => {
      const createdHandler = vi.fn();
      const releasedHandler = vi.fn();
      
      manager.on('savepointCreated', createdHandler);
      manager.on('savepointReleased', releasedHandler);
      
      const callback = vi.fn().mockImplementation(async (tx) => {
        const savepoint = await manager.createSavepoint(tx.id, 'test');
        await manager.releaseSavepoint(tx.id, savepoint);
        return 'success';
      });
      
      await manager.withTransaction(callback);
      
      expect(createdHandler).toHaveBeenCalled();
      expect(releasedHandler).toHaveBeenCalled();
    });
  });
});

describe('withTransaction utility', () => {
  it('should work with regular connection', async () => {
    const callback = vi.fn().mockResolvedValue('success');
    
    const result = await withTransaction(mockConnection, callback);
    
    expect(result.result).toBe('success');
    expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
    expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
  });

  it('should work with connection pool', async () => {
    const mockPoolConnection = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };
    
    const mockPool = {
      getConnection: vi.fn().mockResolvedValue(mockPoolConnection),
    };
    
    const callback = vi.fn().mockResolvedValue('success');
    
    const result = await withTransaction(mockPool as any, callback);
    
    expect(result.result).toBe('success');
    expect(mockPool.getConnection).toHaveBeenCalled();
    expect(mockPoolConnection.query).toHaveBeenCalledWith('BEGIN');
    expect(mockPoolConnection.query).toHaveBeenCalledWith('COMMIT');
    expect(mockPoolConnection.release).toHaveBeenCalled();
  });
});

describe('Transactional decorator', () => {
  it('should wrap method in transaction', async () => {
    class TestService {
      connection = mockConnection;
    }
    
    // Manually apply decorator due to test environment limitations
    const decorator = Transactional();
    const method = async function(value: string) {
      return `processed: ${value}`;
    };
    
    const wrappedMethod = decorator(TestService.prototype, 'doSomething', { value: method }).value;
    const service = new TestService();
    
    const result = await wrappedMethod.call(service, 'test');
    
    expect(result.result).toBe('processed: test');
    expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
    expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
  });

  it('should use transaction options', async () => {
    class TestService {
      connection = mockConnection;
    }
    
    const decorator = Transactional({ isolationLevel: 'SERIALIZABLE', readOnly: true });
    const method = async function() {
      return 'data';
    };
    
    const wrappedMethod = decorator(TestService.prototype, 'readData', { value: method }).value;
    const service = new TestService();
    
    await wrappedMethod.call(service);
    
    expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
    expect(mockConnection.query).toHaveBeenCalledWith('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    expect(mockConnection.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
  });

  it('should handle errors in decorated methods', async () => {
    class TestService {
      connection = mockConnection;
    }
    
    const decorator = Transactional();
    const method = async function() {
      throw new Error('Method failed');
    };
    
    const wrappedMethod = decorator(TestService.prototype, 'failingMethod', { value: method }).value;
    const service = new TestService();
    
    await expect(wrappedMethod.call(service)).rejects.toThrow('Method failed');
    
    expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
    expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
  });
});