import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionPool, createConnectionPool } from './connection-pool.js';

// Mock pg module
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
    end: vi.fn(),
  };

  const mockPool = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    idleCount: 0,
    waitingCount: 0,
    _clients: [],
  };

  return {
    Pool: vi.fn(() => mockPool),
    PoolClient: vi.fn(() => mockClient),
  };
});

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  let mockPoolInstance: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mock pool instance
    const { Pool } = await import('pg');
    mockPoolInstance = new Pool();
    
    // Setup default mock responses
    mockPoolInstance.connect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    });
    
    mockPoolInstance.query.mockResolvedValue({ rows: [{ result: 1 }], rowCount: 1 });
    
    pool = createConnectionPool({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      max: 5,
      healthCheck: { enabled: false }, // Disable for tests
    });
  });

  afterEach(async () => {
    if (pool) {
      await pool.close();
    }
  });

  describe('initialization', () => {
    it('should create pool with default configuration', () => {
      const testPool = createConnectionPool({
        database: 'test',
      });
      
      expect(testPool).toBeInstanceOf(ConnectionPool);
    });

    it('should setup event handlers', () => {
      expect(mockPoolInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('acquire', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('release', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('remove', expect.any(Function));
      expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('connection management', () => {
    it('should get connection from pool', async () => {
      const connection = await pool.getConnection();
      
      expect(mockPoolInstance.connect).toHaveBeenCalled();
      expect(connection).toBeDefined();
      expect(typeof connection.query).toBe('function');
      expect(typeof connection.release).toBe('function');
    });

    it('should execute queries directly on pool', async () => {
      const result = await pool.query('SELECT 1');
      
      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT 1', undefined);
      expect(result.rows).toEqual([{ result: 1 }]);
      expect(result.rowCount).toBe(1);
    });

    it('should handle query errors', async () => {
      const error = new Error('Database error');
      mockPoolInstance.query.mockRejectedValueOnce(error);
      
      await expect(pool.query('SELECT * FROM nonexistent')).rejects.toThrow('Database error');
    });
  });

  describe('transactions', () => {
    it('should execute simple transaction', async () => {
      const mockConnection = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      };
      
      mockPoolInstance.connect.mockResolvedValueOnce(mockConnection);
      
      const result = await pool.transaction(async (conn) => {
        await conn.query('INSERT INTO test VALUES (1)');
        return 'success';
      });
      
      expect(result).toBe('success');
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN', undefined);
      expect(mockConnection.query).toHaveBeenCalledWith('INSERT INTO test VALUES (1)', undefined);
      expect(mockConnection.query).toHaveBeenCalledWith('COMMIT', undefined);
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const mockConnection = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('INSERT')) {
            throw new Error('Insert failed');
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        }),
        release: vi.fn(),
      };
      
      mockPoolInstance.connect.mockResolvedValueOnce(mockConnection);
      
      await expect(pool.transaction(async (conn) => {
        await conn.query('INSERT INTO test VALUES (1)');
        return 'success';
      })).rejects.toThrow('Insert failed');
      
      expect(mockConnection.query).toHaveBeenCalledWith('BEGIN', undefined);
      expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK', undefined);
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should support isolation levels', async () => {
      const mockConnection = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      };
      
      mockPoolInstance.connect.mockResolvedValueOnce(mockConnection);
      
      await pool.transaction(async (conn) => {
        await conn.query('SELECT 1', undefined);
        return 'success';
      }, 'SERIALIZABLE');
      
      // Check that the isolation level was set (second call after BEGIN)
      expect(mockConnection.query).toHaveBeenNthCalledWith(2, 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE', undefined);
    });
  });

  describe('health monitoring', () => {
    it('should perform health check', async () => {
      // Mock Date.now() to return a positive latency
      const mockDateNow = vi.spyOn(Date, 'now');
      mockDateNow.mockReturnValueOnce(100).mockReturnValueOnce(105); // 5ms latency
      
      const health = await pool.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
      expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT 1', undefined);
      
      mockDateNow.mockRestore();
    });

    it('should detect unhealthy state', async () => {
      mockPoolInstance.query.mockRejectedValueOnce(new Error('Connection failed'));
      
      const health = await pool.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Connection failed');
    });

    it('should track query metrics', async () => {
      // Create a new pool with monitoring enabled
      const metricsPool = createConnectionPool({
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
        max: 5,
        healthCheck: { enabled: false },
        monitoring: { enabled: true }, // Explicitly enable monitoring
      });
      
      // Mock Date.now() to return positive durations
      const mockDateNow = vi.spyOn(Date, 'now');
      mockDateNow
        .mockReturnValueOnce(100).mockReturnValueOnce(105) // First query: 5ms
        .mockReturnValueOnce(110).mockReturnValueOnce(115); // Second query: 5ms
      
      await metricsPool.query('SELECT 1');
      await metricsPool.query('SELECT 2');
      
      const metrics = metricsPool.getQueryMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].query).toContain('SELECT');
      expect(metrics[0].duration).toBeGreaterThan(0);
      expect(metrics[0].success).toBe(true);
      
      mockDateNow.mockRestore();
      await metricsPool.close();
    });

    it('should detect slow queries', async () => {
      // Create a new pool with monitoring enabled and low threshold
      const slowPool = createConnectionPool({
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
        max: 5,
        healthCheck: { enabled: false },
        monitoring: { 
          enabled: true, 
          slowQueryThreshold: 50 // Lower threshold for testing
        }
      });
      
      const slowQueryHandler = vi.fn();
      slowPool.on('slowQuery', slowQueryHandler);
      
      // Mock Date.now() to simulate a slow query
      const mockDateNow = vi.spyOn(Date, 'now');
      mockDateNow.mockReturnValueOnce(100).mockReturnValueOnce(200); // 100ms latency (exceeds 50ms threshold)
      
      await slowPool.query('SELECT * FROM large_table');
      
      expect(slowQueryHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('SELECT'),
          duration: expect.any(Number),
        })
      );
      
      mockDateNow.mockRestore();
      await slowPool.close();
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', () => {
      const stats = pool.getStats();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('waitingClients');
      expect(stats).toHaveProperty('totalQueries');
      expect(stats).toHaveProperty('slowQueries');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('averageQueryTime');
      expect(stats).toHaveProperty('uptime');
    });

    it('should clear metrics', async () => {
      await pool.query('SELECT 1');
      expect(pool.getQueryMetrics()).toHaveLength(1);
      
      pool.clearMetrics();
      expect(pool.getQueryMetrics()).toHaveLength(0);
    });
  });

  describe('lifecycle management', () => {
    it('should close gracefully', async () => {
      const closeHandler = vi.fn();
      pool.on('closed', closeHandler);
      
      await pool.close();
      
      expect(mockPoolInstance.end).toHaveBeenCalled();
      expect(closeHandler).toHaveBeenCalled();
    });

    it('should prevent operations after closing', async () => {
      await pool.close();
      
      await expect(pool.getConnection()).rejects.toThrow('shutting down');
    });

    it('should force close connections', async () => {
      mockPoolInstance._clients = [
        { end: vi.fn() },
        { end: vi.fn() },
      ];
      
      await pool.forceClose();
      
      mockPoolInstance._clients.forEach((client: any) => {
        expect(client.end).toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('should emit error events', async () => {
      const errorHandler = vi.fn();
      pool.on('error', errorHandler);
      
      const error = new Error('Connection error');
      mockPoolInstance.connect.mockRejectedValueOnce(error);
      
      await expect(pool.getConnection()).rejects.toThrow('Connection error');
      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should handle pool errors', () => {
      const errorHandler = vi.fn();
      pool.on('error', errorHandler);
      
      // Simulate pool error event
      const poolErrorHandler = mockPoolInstance.on.mock.calls
        .find(call => call[0] === 'error')[1];
      
      const error = new Error('Pool error');
      poolErrorHandler(error, null);
      
      expect(errorHandler).toHaveBeenCalledWith(error, null);
    });
  });

  describe('events', () => {
    it('should emit connection events', () => {
      const connectHandler = vi.fn();
      const acquireHandler = vi.fn();
      const releaseHandler = vi.fn();
      
      pool.on('connect', connectHandler);
      pool.on('acquire', acquireHandler);
      pool.on('release', releaseHandler);
      
      // Simulate pool events
      const handlers = new Map();
      mockPoolInstance.on.mock.calls.forEach(([event, handler]) => {
        handlers.set(event, handler);
      });
      
      const mockClient = { id: 'test-client' };
      
      handlers.get('connect')(mockClient);
      handlers.get('acquire')(mockClient);
      handlers.get('release')(mockClient);
      
      expect(connectHandler).toHaveBeenCalledWith(mockClient);
      expect(acquireHandler).toHaveBeenCalledWith(mockClient);
      expect(releaseHandler).toHaveBeenCalledWith(mockClient);
    });
  });
});