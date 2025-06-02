/**
 * Advanced transaction manager with nested transactions and savepoints
 * Provides comprehensive transaction control with deadlock detection
 */

import { EventEmitter } from 'events';
import type { Connection } from './connection.js';
import type { ConnectionPool } from './connection-pool.js';

export type IsolationLevel = 
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  timeout?: number;
  retryOnDeadlock?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  readOnly?: boolean;
  deferrable?: boolean;
}

export interface TransactionContext {
  readonly id: string;
  readonly level: number;
  readonly isolationLevel?: IsolationLevel;
  readonly startTime: Date;
  readonly savepoints: string[];
  readonly readOnly: boolean;
  isActive: boolean;
}

export interface TransactionResult<T> {
  result: T;
  duration: number;
  retries: number;
  savepoints: number;
}

/**
 * Comprehensive transaction manager with advanced features
 */
export class TransactionManager extends EventEmitter {
  private connection: Connection;
  private activeTransactions = new Map<string, TransactionContext>();
  private nextTransactionId = 1;
  private nextSavepointId = 1;

  constructor(connection: Connection) {
    super();
    this.connection = connection;
  }

  /**
   * Execute a function within a transaction
   */
  async withTransaction<T>(
    callback: (tx: TransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const maxRetries = options.maxRetries ?? (options.retryOnDeadlock ? 3 : 0);
    let retries = 0;
    let lastError: Error | undefined;

    while (retries <= maxRetries) {
      try {
        return await this.executeTransaction(callback, options, retries);
      } catch (error) {
        lastError = error as Error;
        
        if (this.isDeadlock(error) && options.retryOnDeadlock && retries < maxRetries) {
          retries++;
          this.emit('deadlockRetry', { 
            error, 
            attempt: retries, 
            maxRetries,
            delay: options.retryDelay || 100 
          });
          
          // Wait before retry with exponential backoff
          const delay = (options.retryDelay || 100) * Math.pow(2, retries - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * Create a savepoint within an active transaction
   */
  async createSavepoint(transactionId: string, name?: string): Promise<string> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction || !transaction.isActive) {
      throw new Error(`No active transaction found: ${transactionId}`);
    }

    const savepointName = name || `sp_${this.nextSavepointId++}`;
    
    try {
      await this.connection.query(`SAVEPOINT ${savepointName}`);
      transaction.savepoints.push(savepointName);
      
      this.emit('savepointCreated', { transactionId, savepoint: savepointName });
      return savepointName;
    } catch (error) {
      this.emit('savepointError', { transactionId, savepoint: savepointName, error });
      throw error;
    }
  }

  /**
   * Rollback to a specific savepoint
   */
  async rollbackToSavepoint(transactionId: string, savepointName: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction || !transaction.isActive) {
      throw new Error(`No active transaction found: ${transactionId}`);
    }

    const savepointIndex = transaction.savepoints.indexOf(savepointName);
    if (savepointIndex === -1) {
      throw new Error(`Savepoint not found: ${savepointName}`);
    }

    try {
      await this.connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      
      // Remove savepoints created after this one
      transaction.savepoints.splice(savepointIndex + 1);
      
      this.emit('savepointRollback', { transactionId, savepoint: savepointName });
    } catch (error) {
      this.emit('savepointError', { transactionId, savepoint: savepointName, error });
      throw error;
    }
  }

  /**
   * Release a savepoint
   */
  async releaseSavepoint(transactionId: string, savepointName: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction || !transaction.isActive) {
      throw new Error(`No active transaction found: ${transactionId}`);
    }

    const savepointIndex = transaction.savepoints.indexOf(savepointName);
    if (savepointIndex === -1) {
      throw new Error(`Savepoint not found: ${savepointName}`);
    }

    try {
      await this.connection.query(`RELEASE SAVEPOINT ${savepointName}`);
      transaction.savepoints.splice(savepointIndex, 1);
      
      this.emit('savepointReleased', { transactionId, savepoint: savepointName });
    } catch (error) {
      this.emit('savepointError', { transactionId, savepoint: savepointName, error });
      throw error;
    }
  }

  /**
   * Get active transaction by ID
   */
  getTransaction(transactionId: string): TransactionContext | undefined {
    return this.activeTransactions.get(transactionId);
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): TransactionContext[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Check if there are any active transactions
   */
  hasActiveTransactions(): boolean {
    return this.activeTransactions.size > 0;
  }

  /**
   * Force rollback of all active transactions (emergency cleanup)
   */
  async rollbackAll(): Promise<void> {
    const transactions = Array.from(this.activeTransactions.keys());
    
    for (const transactionId of transactions) {
      try {
        await this.forceRollback(transactionId);
      } catch (error) {
        this.emit('rollbackError', { transactionId, error });
      }
    }
  }

  /**
   * Execute the actual transaction
   */
  private async executeTransaction<T>(
    callback: (tx: TransactionContext) => Promise<T>,
    options: TransactionOptions,
    attempt: number
  ): Promise<TransactionResult<T>> {
    const transactionId = `tx_${this.nextTransactionId++}`;
    const startTime = new Date();
    let timeoutHandle: NodeJS.Timeout | undefined;

    const transaction: TransactionContext = {
      id: transactionId,
      level: this.getNestedLevel(),
      isolationLevel: options.isolationLevel,
      startTime,
      savepoints: [],
      readOnly: options.readOnly || false,
      isActive: true,
    };

    this.activeTransactions.set(transactionId, transaction);

    try {
      // Set timeout if specified
      let timeoutPromise: Promise<never> | undefined;
      if (options.timeout) {
        timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Transaction timeout after ${options.timeout}ms`));
          }, options.timeout);
        });
      }

      await this.beginTransaction(transaction, options);
      
      this.emit('transactionStarted', { 
        transactionId, 
        level: transaction.level,
        attempt: attempt + 1 
      });

      // Execute callback with timeout if specified
      const result = timeoutPromise 
        ? await Promise.race([callback(transaction), timeoutPromise])
        : await callback(transaction);

      await this.commitTransaction(transactionId);

      const duration = Date.now() - startTime.getTime();
      
      this.emit('transactionCommitted', { 
        transactionId, 
        duration,
        savepoints: transaction.savepoints.length 
      });

      return {
        result,
        duration,
        retries: attempt,
        savepoints: transaction.savepoints.length,
      };

    } catch (error) {
      await this.rollbackTransaction(transactionId);
      
      this.emit('transactionRolledBack', { 
        transactionId, 
        error,
        attempt: attempt + 1 
      });
      
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Begin a new transaction
   */
  private async beginTransaction(
    transaction: TransactionContext, 
    options: TransactionOptions
  ): Promise<void> {
    const statements: string[] = [];

    if (transaction.level === 0) {
      // Root transaction
      statements.push('BEGIN');

      if (options.isolationLevel) {
        statements.push(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
      }

      if (options.readOnly) {
        statements.push('SET TRANSACTION READ ONLY');
      }

      if (options.deferrable && options.readOnly) {
        statements.push('SET TRANSACTION DEFERRABLE');
      }
    } else {
      // Nested transaction - use savepoint
      const savepointName = `sp_level_${transaction.level}`;
      statements.push(`SAVEPOINT ${savepointName}`);
      transaction.savepoints.push(savepointName);
    }

    for (const statement of statements) {
      await this.connection.query(statement);
    }
  }

  /**
   * Commit a transaction
   */
  private async commitTransaction(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction || !transaction.isActive) {
      throw new Error(`No active transaction found: ${transactionId}`);
    }

    if (transaction.level === 0) {
      // Root transaction
      await this.connection.query('COMMIT');
    } else {
      // Nested transaction - release savepoint
      const savepointName = transaction.savepoints[transaction.savepoints.length - 1];
      if (savepointName) {
        await this.connection.query(`RELEASE SAVEPOINT ${savepointName}`);
      }
    }

    transaction.isActive = false;
  }

  /**
   * Rollback a transaction
   */
  private async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      return; // Already cleaned up
    }

    try {
      if (transaction.level === 0) {
        // Root transaction
        await this.connection.query('ROLLBACK');
      } else {
        // Nested transaction - rollback to savepoint
        const savepointName = transaction.savepoints[transaction.savepoints.length - 1];
        if (savepointName) {
          await this.connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        }
      }
    } catch (error) {
      // Ignore errors during rollback - connection might be dead
      this.emit('rollbackError', { transactionId, error });
    }

    transaction.isActive = false;
  }

  /**
   * Force rollback of a specific transaction
   */
  private async forceRollback(transactionId: string): Promise<void> {
    await this.rollbackTransaction(transactionId);
    this.activeTransactions.delete(transactionId);
  }

  /**
   * Get the current nesting level
   */
  private getNestedLevel(): number {
    return this.activeTransactions.size;
  }

  /**
   * Check if an error is a deadlock
   */
  private isDeadlock(error: any): boolean {
    const deadlockCodes = ['40P01', '40001']; // PostgreSQL deadlock codes
    return error && deadlockCodes.includes(error.code);
  }
}

/**
 * Utility function to run code in a transaction
 */
export async function withTransaction<T>(
  connection: Connection | ConnectionPool,
  callback: (tx: TransactionContext) => Promise<T>,
  options: TransactionOptions = {}
): Promise<TransactionResult<T>> {
  // Handle both Connection and ConnectionPool
  let actualConnection: Connection;
  let shouldRelease = false;

  if ('getConnection' in connection) {
    // ConnectionPool
    actualConnection = await connection.getConnection();
    shouldRelease = true;
  } else {
    // Regular Connection
    actualConnection = connection;
  }

  const manager = new TransactionManager(actualConnection);

  try {
    return await manager.withTransaction(callback, options);
  } finally {
    if (shouldRelease && 'release' in actualConnection) {
      (actualConnection as any).release();
    }
  }
}

/**
 * Decorator for automatic transaction management
 */
export function Transactional(options: TransactionOptions = {}) {
  return function (target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
    // Handle both legacy decorator and new decorator API
    if (!descriptor) {
      // New decorator API - return a method descriptor
      return {
        kind: 'method',
        key: propertyKey,
        value: async function (...args: any[]) {
          const connection = this.connection || this.getConnection?.();
          
          if (!connection) {
            throw new Error('No connection available for transaction');
          }

          return withTransaction(connection, async () => {
            return target.apply(this, args);
          }, options);
        }
      };
    }
    
    // Legacy decorator API
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const connection = this.connection || this.getConnection?.();
      
      if (!connection) {
        throw new Error('No connection available for transaction');
      }

      return withTransaction(connection, async () => {
        return originalMethod.apply(this, args);
      }, options);
    };

    return descriptor;
  };
}