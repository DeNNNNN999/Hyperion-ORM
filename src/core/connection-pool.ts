/**
 * Connection pooling implementation with advanced features
 * Provides efficient database connection management with health monitoring
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { EventEmitter } from 'events';
import { Connection } from './connection.js';

export interface ConnectionPoolConfig extends PoolConfig {
  // Pool settings
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  
  // Health check settings
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  
  // Reconnection settings
  reconnection?: {
    enabled?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    exponentialBackoff?: boolean;
  };
  
  // Monitoring
  monitoring?: {
    enabled?: boolean;
    slowQueryThreshold?: number;
    logQueries?: boolean;
  };
}

export interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalQueries: number;
  slowQueries: number;
  errors: number;
  averageQueryTime: number;
  uptime: number;
}

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Enhanced connection pool with monitoring and health checks
 */
export class ConnectionPool extends EventEmitter {
  private pool: Pool;
  private config: Required<ConnectionPoolConfig>;
  private stats: PoolStats;
  private queryMetrics: QueryMetrics[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private startTime: number;
  private isShuttingDown = false;

  constructor(config: ConnectionPoolConfig) {
    super();
    
    this.config = {
      // PostgreSQL defaults
      host: config.host || 'localhost',
      port: config.port || 5432,
      database: config.database || 'postgres',
      user: config.user || 'postgres',
      password: config.password || '',
      
      // Pool defaults
      min: config.min || 2,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
      
      // Health check defaults
      healthCheck: {
        enabled: config.healthCheck?.enabled ?? true,
        interval: config.healthCheck?.interval || 30000,
        timeout: config.healthCheck?.timeout || 5000,
        retries: config.healthCheck?.retries || 3,
        ...config.healthCheck,
      },
      
      // Reconnection defaults
      reconnection: {
        enabled: config.reconnection?.enabled ?? true,
        maxRetries: config.reconnection?.maxRetries || 5,
        retryDelay: config.reconnection?.retryDelay || 1000,
        exponentialBackoff: config.reconnection?.exponentialBackoff ?? true,
        ...config.reconnection,
      },
      
      // Monitoring defaults
      monitoring: {
        enabled: config.monitoring?.enabled ?? true,
        slowQueryThreshold: config.monitoring?.slowQueryThreshold || 1000,
        logQueries: config.monitoring?.logQueries ?? false,
        ...config.monitoring,
      },
      
      // Include any other pg config
      ...config,
    };

    this.startTime = Date.now();
    this.stats = {
      totalConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      slowQueries: 0,
      errors: 0,
      averageQueryTime: 0,
      uptime: 0,
    };

    this.pool = new Pool(this.config);
    this.setupPoolEventHandlers();
    
    if (this.config.healthCheck.enabled) {
      this.startHealthCheck();
    }
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<PooledConnection> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    try {
      const client = await this.pool.connect();
      const connection = new PooledConnection(client, this);
      this.updateStats();
      return connection;
    } catch (error) {
      this.stats.errors++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Execute a query directly on the pool
   */
  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      const result = await this.pool.query(sql, params);
      
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      this.stats.errors++;
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      this.recordQueryMetrics(sql, duration, success, error);
    }
  }

  /**
   * Execute a query within a transaction
   */
  async transaction<T>(
    callback: (connection: PooledConnection) => Promise<T>,
    isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'
  ): Promise<T> {
    const connection = await this.getConnection();
    
    try {
      await connection.query('BEGIN');
      
      if (isolationLevel) {
        await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      }
      
      const result = await callback(connection);
      
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get recent query metrics
   */
  getQueryMetrics(limit: number = 100): QueryMetrics[] {
    return this.queryMetrics.slice(-limit);
  }

  /**
   * Clear query metrics
   */
  clearMetrics(): void {
    this.queryMetrics = [];
  }

  /**
   * Health check - verify pool connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await this.query('SELECT 1');
      const latency = Date.now() - startTime;
      
      return { healthy: true, latency };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Gracefully close the pool
   */
  async close(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.emit('closing');
    
    try {
      await this.pool.end();
      this.emit('closed');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Force close all connections
   */
  async forceClose(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Force close doesn't wait for active connections
    this.pool.removeAllListeners();
    
    const clients = (this.pool as any)._clients || [];
    for (const client of clients) {
      try {
        client.end();
      } catch (error) {
        // Ignore errors during force close
      }
    }
    
    this.emit('closed');
  }

  /**
   * Setup event handlers for the pool
   */
  private setupPoolEventHandlers(): void {
    this.pool.on('connect', (client) => {
      this.stats.totalConnections++;
      this.emit('connect', client);
    });

    this.pool.on('acquire', (client) => {
      this.emit('acquire', client);
    });

    this.pool.on('release', (client) => {
      this.emit('release', client);
    });

    this.pool.on('remove', (client) => {
      this.stats.totalConnections--;
      this.emit('remove', client);
    });

    this.pool.on('error', (error, client) => {
      this.stats.errors++;
      this.emit('error', error, client);
      
      // Attempt reconnection if enabled
      if (this.config.reconnection.enabled) {
        this.attemptReconnection();
      }
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        this.emit('healthCheck', health);
        
        if (!health.healthy) {
          this.emit('unhealthy', health);
        }
      } catch (error) {
        this.emit('healthCheckError', error);
      }
    }, this.config.healthCheck.interval);
  }

  /**
   * Attempt to reconnect after connection loss
   */
  private async attemptReconnection(retryCount = 0): Promise<void> {
    if (retryCount >= this.config.reconnection.maxRetries) {
      this.emit('reconnectionFailed', { retries: retryCount });
      return;
    }

    const delay = this.config.reconnection.exponentialBackoff
      ? this.config.reconnection.retryDelay * Math.pow(2, retryCount)
      : this.config.reconnection.retryDelay;

    this.emit('reconnectionAttempt', { attempt: retryCount + 1, delay });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const health = await this.healthCheck();
      if (health.healthy) {
        this.emit('reconnectionSuccess', { attempts: retryCount + 1 });
        return;
      }
    } catch (error) {
      // Continue with retry
    }

    return this.attemptReconnection(retryCount + 1);
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.idleConnections = this.pool.idleCount;
    this.stats.waitingClients = this.pool.waitingCount;
    this.stats.uptime = Date.now() - this.startTime;
    
    if (this.queryMetrics.length > 0) {
      const totalTime = this.queryMetrics.reduce((sum, metric) => sum + metric.duration, 0);
      this.stats.averageQueryTime = totalTime / this.queryMetrics.length;
    }
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(
    query: string, 
    duration: number, 
    success: boolean, 
    error?: string
  ): void {
    if (!this.config.monitoring.enabled) return;

    this.stats.totalQueries++;
    
    if (duration > this.config.monitoring.slowQueryThreshold) {
      this.stats.slowQueries++;
      this.emit('slowQuery', { query, duration });
    }

    const metrics: QueryMetrics = {
      query: this.config.monitoring.logQueries ? query : query.substring(0, 100) + '...',
      duration,
      timestamp: new Date(),
      success,
      error,
    };

    this.queryMetrics.push(metrics);
    
    // Keep only last 1000 metrics to prevent memory leak
    if (this.queryMetrics.length > 1000) {
      this.queryMetrics = this.queryMetrics.slice(-1000);
    }

    this.emit('queryComplete', metrics);
  }
}

/**
 * Wrapper around PoolClient that implements the Connection interface
 */
export class PooledConnection implements Connection {
  private client: PoolClient;
  private pool: ConnectionPool;
  private released = false;

  constructor(client: PoolClient, pool: ConnectionPool) {
    this.client = client;
    this.pool = pool;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    if (this.released) {
      throw new Error('Connection has been released back to the pool');
    }

    const startTime = Date.now();
    
    try {
      const result = await this.client.query(sql, params);
      
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } finally {
      const duration = Date.now() - startTime;
      (this.pool as any).recordQueryMetrics(sql, duration, true);
    }
  }

  release(): void {
    if (!this.released) {
      this.client.release();
      this.released = true;
    }
  }

  // Connection interface compatibility
  async connect(): Promise<void> {
    // Already connected via pool
  }

  async disconnect(): Promise<void> {
    this.release();
  }
}

// Factory function
export function createConnectionPool(config: ConnectionPoolConfig): ConnectionPool {
  return new ConnectionPool(config);
}