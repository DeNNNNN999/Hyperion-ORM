import { Pool } from 'pg';
import type { PoolConfig, QueryResultRow } from 'pg';
import type { ConnectionConfig } from '../types/index.js';

/**
 * Database connection manager with strict type safety
 */
export class Connection {
  private readonly pool: Pool;
  private readonly _config: Readonly<ConnectionConfig>;

  constructor(config: ConnectionConfig) {
    this._config = Object.freeze({ ...config });
    
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 30000,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 10000,
      max: config.max ?? 10,
    };

    this.pool = new Pool(poolConfig);
  }

  /**
   * Execute a query with parameters
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[]
  ): Promise<readonly T[]> {
    const result = await this.pool.query<T>(text, params ? [...params] : undefined);
    return result.rows;
  }

  /**
   * Execute a query and return the first row
   */
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[]
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Get connection statistics
   */
  getStats(): Readonly<{
    total: number;
    idle: number;
    waiting: number;
  }> {
    return Object.freeze({
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    });
  }

  /**
   * Get the connection configuration (read-only)
   */
  get config(): Readonly<ConnectionConfig> {
    return this._config;
  }
}