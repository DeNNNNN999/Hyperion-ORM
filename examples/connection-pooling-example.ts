/**
 * Connection pooling and transaction management examples
 * Demonstrates advanced database connection handling
 */

import { createConnectionPool } from '../src/core/connection-pool.js';
import { withTransaction, TransactionManager, Transactional } from '../src/core/transaction-manager.js';
import { UnitOfWork } from '../src/core/unit-of-work.js';

async function connectionPoolExamples() {
  console.log('=== Connection Pool Examples ===\n');

  // Example 1: Create connection pool with monitoring
  console.log('🔗 Creating connection pool...');
  const pool = createConnectionPool({
    host: 'localhost',
    port: 5432,
    database: 'hyperion_example',
    user: 'postgres',
    password: 'password',
    
    // Pool configuration
    min: 2,          // Minimum connections
    max: 20,         // Maximum connections
    idleTimeoutMillis: 30000,    // 30 seconds
    connectionTimeoutMillis: 5000, // 5 seconds
    
    // Health monitoring
    healthCheck: {
      enabled: true,
      interval: 30000,  // Check every 30 seconds
      timeout: 5000,    // 5 second timeout
      retries: 3,       // Retry 3 times before marking unhealthy
    },
    
    // Auto-reconnection
    reconnection: {
      enabled: true,
      maxRetries: 5,
      retryDelay: 1000,
      exponentialBackoff: true,
    },
    
    // Query monitoring
    monitoring: {
      enabled: true,
      slowQueryThreshold: 1000, // Log queries > 1 second
      logQueries: false,        // Don't log all queries
    },
  });

  // Example 2: Pool event monitoring
  console.log('📊 Setting up pool monitoring...');
  
  pool.on('connect', (client) => {
    console.log('🔗 New connection established');
  });
  
  pool.on('acquire', (client) => {
    console.log('📥 Connection acquired from pool');
  });
  
  pool.on('release', (client) => {
    console.log('📤 Connection released to pool');
  });
  
  pool.on('error', (error) => {
    console.error('❌ Pool error:', error.message);
  });
  
  pool.on('slowQuery', ({ query, duration }) => {
    console.warn(`🐌 Slow query detected (${duration}ms): ${query.substring(0, 50)}...`);
  });
  
  pool.on('healthCheck', (health) => {
    if (health.healthy) {
      console.log(`💚 Health check passed (${health.latency}ms)`);
    } else {
      console.error(`💔 Health check failed: ${health.error}`);
    }
  });

  try {
    // Example 3: Basic pool usage
    console.log('\n🔄 Executing queries through pool...');
    
    // Direct query execution
    const result1 = await pool.query('SELECT NOW() as current_time');
    console.log('Current time:', result1.rows[0].current_time);
    
    // Using individual connections
    const connection = await pool.getConnection();
    try {
      const result2 = await connection.query('SELECT version() as pg_version');
      console.log('PostgreSQL version:', result2.rows[0].pg_version.substring(0, 50) + '...');
    } finally {
      connection.release(); // Always release!
    }

    // Example 4: Simple transactions
    console.log('\n💰 Running transaction examples...');
    
    const transferResult = await pool.transaction(async (conn) => {
      // Simulate money transfer
      await conn.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [100, 1]);
      await conn.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [100, 2]);
      
      // Check balances
      const balances = await conn.query('SELECT id, balance FROM accounts WHERE id IN ($1, $2)', [1, 2]);
      
      return {
        success: true,
        balances: balances.rows,
      };
    });
    
    console.log('Transfer completed:', transferResult);

    // Example 5: Transaction with isolation level
    console.log('\n🔒 Serializable transaction example...');
    
    const serializedResult = await pool.transaction(async (conn) => {
      // This transaction will be isolated from concurrent modifications
      const data = await conn.query('SELECT COUNT(*) as total FROM orders');
      
      // Some complex business logic that needs consistency
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return { totalOrders: parseInt(data.rows[0].total) };
    }, 'SERIALIZABLE');
    
    console.log('Serialized operation result:', serializedResult);

    // Example 6: Pool statistics
    console.log('\n📈 Pool statistics:');
    const stats = pool.getStats();
    console.log(`- Total connections: ${stats.totalConnections}`);
    console.log(`- Idle connections: ${stats.idleConnections}`);
    console.log(`- Waiting clients: ${stats.waitingClients}`);
    console.log(`- Total queries: ${stats.totalQueries}`);
    console.log(`- Slow queries: ${stats.slowQueries}`);
    console.log(`- Average query time: ${stats.averageQueryTime.toFixed(2)}ms`);
    console.log(`- Uptime: ${(stats.uptime / 1000).toFixed(1)}s`);

    // Example 7: Query metrics
    console.log('\n📊 Recent query metrics:');
    const metrics = pool.getQueryMetrics(5);
    metrics.forEach((metric, i) => {
      console.log(`${i + 1}. ${metric.query.substring(0, 40)}... (${metric.duration}ms)`);
    });

  } finally {
    // Always close the pool
    await pool.close();
    console.log('\n🔒 Pool closed gracefully');
  }
}

async function advancedTransactionExamples() {
  console.log('\n=== Advanced Transaction Examples ===\n');

  const pool = createConnectionPool({
    host: 'localhost',
    port: 5432,
    database: 'hyperion_example',
    user: 'postgres',
    password: 'password',
    max: 5,
    healthCheck: { enabled: false }, // Disable for demo
  });

  try {
    // Example 1: Nested transactions with savepoints
    console.log('🏗️ Nested transaction example...');
    
    const result = await withTransaction(pool, async (outerTx) => {
      console.log(`Started outer transaction: ${outerTx.id}`);
      
      // Some work in outer transaction
      await pool.query('INSERT INTO audit_log (action) VALUES ($1)', ['outer_start']);
      
      // Inner transaction (creates savepoint)
      const innerResult = await withTransaction(pool, async (innerTx) => {
        console.log(`Started inner transaction: ${innerTx.id} (level ${innerTx.level})`);
        
        await pool.query('INSERT INTO audit_log (action) VALUES ($1)', ['inner_work']);
        
        // This could fail, but won't affect outer transaction
        return { innerData: 'processed' };
      });
      
      console.log('Inner transaction completed:', innerResult.result);
      
      await pool.query('INSERT INTO audit_log (action) VALUES ($1)', ['outer_complete']);
      
      return {
        outer: 'success',
        inner: innerResult.result,
        totalTime: innerResult.duration,
      };
    });
    
    console.log('Nested transaction result:', result.result);

    // Example 2: Manual savepoint management
    console.log('\n💾 Manual savepoint management...');
    
    const connection = await pool.getConnection();
    const txManager = new TransactionManager(connection);
    
    try {
      const complexResult = await txManager.withTransaction(async (tx) => {
        // Critical operation that might need rollback
        const savepoint1 = await txManager.createSavepoint(tx.id, 'before_risky_operation');
        
        try {
          // Risky operation
          await connection.query('UPDATE products SET price = price * 1.1 WHERE category = $1', ['electronics']);
          
          // Check if price increase is reasonable
          const expensiveProducts = await connection.query(
            'SELECT COUNT(*) as count FROM products WHERE price > $1', [10000]
          );
          
          if (parseInt(expensiveProducts.rows[0].count) > 10) {
            throw new Error('Price increase would make too many products expensive');
          }
          
          // Success - release savepoint
          await txManager.releaseSavepoint(tx.id, savepoint1);
          console.log('✅ Price increase successful');
          
        } catch (error) {
          // Rollback to savepoint
          await txManager.rollbackToSavepoint(tx.id, savepoint1);
          console.log('⏪ Rolled back price increase:', error.message);
          
          // Try alternative approach
          await connection.query('UPDATE products SET price = price * 1.05 WHERE category = $1', ['electronics']);
          console.log('✅ Applied smaller price increase instead');
        }
        
        return 'operation completed with fallback';
      });
      
      console.log('Complex operation result:', complexResult.result);
      
    } finally {
      connection.release();
    }

    // Example 3: Deadlock handling
    console.log('\n⚔️ Deadlock simulation and retry...');
    
    let deadlockAttempts = 0;
    
    const deadlockResult = await withTransaction(pool, async (tx) => {
      deadlockAttempts++;
      
      if (deadlockAttempts < 3) {
        // Simulate deadlock
        const error = new Error('Deadlock detected') as any;
        error.code = '40P01'; // PostgreSQL deadlock code
        throw error;
      }
      
      // Success after retries
      return `Success after ${deadlockAttempts} attempts`;
    }, {
      retryOnDeadlock: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    
    console.log('Deadlock handling result:', deadlockResult.result);
    console.log(`Retries: ${deadlockResult.retries}`);

    // Example 4: Transaction timeout
    console.log('\n⏰ Transaction timeout example...');
    
    try {
      await withTransaction(pool, async (tx) => {
        // Simulate long-running operation
        console.log('Starting long operation...');
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'should not complete';
      }, {
        timeout: 100, // 100ms timeout
      });
    } catch (error) {
      console.log('✅ Transaction timed out as expected:', error.message);
    }

  } finally {
    await pool.close();
  }
}

// Example service using decorators
class UserService {
  constructor(private pool: any) {}
  
  getConnection() {
    return this.pool;
  }
  
  @Transactional({ isolationLevel: 'READ COMMITTED' })
  async createUser(userData: any) {
    const connection = await this.pool.getConnection();
    
    try {
      // Insert user
      const userResult = await connection.query(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
        [userData.email, userData.name]
      );
      
      // Create user profile
      await connection.query(
        'INSERT INTO user_profiles (user_id, bio) VALUES ($1, $2)',
        [userResult.rows[0].id, userData.bio || '']
      );
      
      // Send welcome email (simulated)
      console.log(`📧 Welcome email sent to ${userData.email}`);
      
      return {
        id: userResult.rows[0].id,
        email: userData.email,
        name: userData.name,
      };
    } finally {
      connection.release();
    }
  }
  
  @Transactional({ 
    retryOnDeadlock: true,
    maxRetries: 3,
    isolationLevel: 'SERIALIZABLE'
  })
  async transferCredits(fromUserId: number, toUserId: number, amount: number) {
    const connection = await this.pool.getConnection();
    
    try {
      // Check source balance
      const sourceBalance = await connection.query(
        'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
        [fromUserId]
      );
      
      if (sourceBalance.rows[0].credits < amount) {
        throw new Error('Insufficient credits');
      }
      
      // Perform transfer
      await connection.query(
        'UPDATE users SET credits = credits - $1 WHERE id = $2',
        [amount, fromUserId]
      );
      
      await connection.query(
        'UPDATE users SET credits = credits + $1 WHERE id = $2',
        [amount, toUserId]
      );
      
      // Log transaction
      await connection.query(
        'INSERT INTO credit_transfers (from_user, to_user, amount) VALUES ($1, $2, $3)',
        [fromUserId, toUserId, amount]
      );
      
      return { success: true, amount };
    } finally {
      connection.release();
    }
  }
}

async function decoratorExamples() {
  console.log('\n=== Transaction Decorator Examples ===\n');
  
  const pool = createConnectionPool({
    host: 'localhost',
    port: 5432,
    database: 'hyperion_example',
    user: 'postgres',
    password: 'password',
    max: 3,
    healthCheck: { enabled: false },
  });
  
  const userService = new UserService(pool);
  
  try {
    // Example 1: Create user with automatic transaction
    console.log('👤 Creating user with transaction decorator...');
    
    const newUser = await userService.createUser({
      email: 'john@example.com',
      name: 'John Doe',
      bio: 'Software developer',
    });
    
    console.log('✅ User created:', newUser);
    
    // Example 2: Credit transfer with retry logic
    console.log('\n💸 Transferring credits with deadlock protection...');
    
    const transferResult = await userService.transferCredits(1, 2, 100);
    console.log('✅ Transfer completed:', transferResult);
    
  } catch (error) {
    console.error('❌ Service operation failed:', error.message);
  } finally {
    await pool.close();
  }
}

async function integrationWithUnitOfWork() {
  console.log('\n=== Integration with Unit of Work ===\n');
  
  const pool = createConnectionPool({
    host: 'localhost',
    port: 5432,
    database: 'hyperion_example',
    user: 'postgres',
    password: 'password',
    max: 5,
    healthCheck: { enabled: false },
  });
  
  try {
    // Use pooled connection with Unit of Work
    const connection = await pool.getConnection();
    
    const uow = new UnitOfWork({
      enableChangeTracking: true,
      transaction: true,
    });
    
    uow.setConnection(connection);
    
    // Register entities (simplified)
    uow.registerEntity({
      entity: 'User',
      table: 'users',
      primaryKey: 'id',
      columns: new Map([
        ['id', 'id'],
        ['email', 'email'],
        ['name', 'name'],
        ['credits', 'credits'],
      ]),
    });
    
    // Use Unit of Work with pooled connection
    const user1 = uow.create('User', {
      id: 1,
      email: 'alice@example.com',
      name: 'Alice',
      credits: 1000,
    });
    
    const user2 = uow.create('User', {
      id: 2,
      email: 'bob@example.com',
      name: 'Bob',
      credits: 500,
    });
    
    // Modify entities
    user1.credits -= 100;
    user2.credits += 100;
    
    console.log('📊 Unit of Work statistics:');
    const stats = uow.getStats();
    console.log(`- Identity Map: ${stats.identityMap.totalKeys} entities`);
    console.log(`- Change Tracker: ${stats.changeTracker.total} tracked, ${stats.changeTracker.updated} modified`);
    
    // Commit changes
    console.log('\n💾 Committing changes...');
    const commitResult = await uow.commit();
    console.log(`✅ Committed: ${commitResult.created} created, ${commitResult.updated} updated`);
    
    connection.release();
    
  } finally {
    await pool.close();
  }
}

// Production tips
function productionTips() {
  console.log('\n=== Production Tips ===\n');
  
  const tips = [
    '🔧 Configure pool size based on your database server capacity',
    '📊 Monitor connection pool metrics in production',
    '⚠️  Set up alerts for pool exhaustion and slow queries',
    '🔄 Use health checks to detect connection issues early',
    '⏰ Set appropriate timeouts for transactions',
    '🛡️ Always handle deadlocks in concurrent applications',
    '💾 Use savepoints for complex business logic that might need partial rollbacks',
    '🔒 Choose appropriate isolation levels for your use case',
    '📈 Monitor transaction duration and retry rates',
    '🚨 Have circuit breakers for database connectivity issues',
  ];
  
  tips.forEach(tip => console.log(tip));
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve()
    .then(() => connectionPoolExamples())
    .then(() => advancedTransactionExamples())
    .then(() => decoratorExamples())
    .then(() => integrationWithUnitOfWork())
    .then(() => productionTips())
    .catch(console.error);
}