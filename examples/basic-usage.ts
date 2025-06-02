import { Connection } from '../src/index.js';

// Example usage of the Hyperion ORM
async function main() {
  // Create a connection
  const connection = new Connection({
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'postgres',
    password: 'password',
    ssl: false,
    max: 20,
  });

  try {
    // Example query
    const users = await connection.query<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE active = $1',
      [true]
    );
    
    console.log('Active users:', users);

    // Example single row query
    const user = await connection.queryOne<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE id = $1',
      [1]
    );
    
    console.log('User with ID 1:', user);

    // Get connection stats
    const stats = connection.getStats();
    console.log('Connection pool stats:', stats);

    // Access config (read-only)
    console.log('Database:', connection.config.database);
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    // Always close the connection
    await connection.close();
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}