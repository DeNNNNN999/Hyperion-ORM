/**
 * Hyperion ORM configuration for benchmarks
 */

import { createConnectionPool } from '../../../src/core/connection-pool.js';
import { schema, column } from '../../../src/schema/index.js';
import { createQueryBuilder } from '../../../src/query/index.js';
import { UnitOfWork } from '../../../src/core/index.js';

// Schema definitions
export const UserSchema = schema('User', {
  id: column.integer().primary().autoIncrement(),
  email: column.string(255).unique(),
  name: column.string(255),
  age: column.integer().nullable(),
  isActive: column.boolean().default(true),
  createdAt: column.timestamp().default('NOW()'),
  updatedAt: column.timestamp().default('NOW()'),
}).table('users').build();

export const PostSchema = schema('Post', {
  id: column.integer().primary().autoIncrement(),
  title: column.string(255),
  content: column.text().nullable(),
  userId: column.integer().references(UserSchema.table, 'id'),
  views: column.integer().default(0),
  published: column.boolean().default(false),
  createdAt: column.timestamp().default('NOW()'),
  updatedAt: column.timestamp().default('NOW()'),
}).table('posts').build();

export const CommentSchema = schema('Comment', {
  id: column.integer().primary().autoIncrement(),
  content: column.text(),
  postId: column.integer().references(PostSchema.table, 'id'),
  userId: column.integer().references(UserSchema.table, 'id'),
  createdAt: column.timestamp().default('NOW()'),
}).table('comments').build();

export const CategorySchema = schema('Category', {
  id: column.integer().primary().autoIncrement(),
  name: column.string(255),
  description: column.text().nullable(),
}).table('categories').build();

// Connection setup
export const pool = createConnectionPool({
  host: 'localhost',
  port: 5432,
  database: 'orm_benchmark',
  user: 'postgres',
  password: 'password',
  max: 20,
  min: 5,
  healthCheck: { enabled: false },
  monitoring: { enabled: true },
});

// Helper functions for benchmarks
export const hyperionORM = {
  name: 'Hyperion ORM',
  
  // Simple queries
  async findUserById(id: number) {
    return createQueryBuilder(UserSchema)
      .where({ id })
      .one();
  },

  async findUserByEmail(email: string) {
    return createQueryBuilder(UserSchema)
      .where({ email })
      .one();
  },

  async findActiveUsers() {
    return createQueryBuilder(UserSchema)
      .where({ isActive: true })
      .many();
  },

  // Complex queries with joins
  async findUserWithPosts(userId: number) {
    const connection = await pool.getConnection();
    try {
      const result = await connection.query(`
        SELECT 
          u.*, 
          p.id as post_id, p.title, p.content, p.views, p.published
        FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
        WHERE u.id = $1
      `, [userId]);
      
      return result.rows;
    } finally {
      connection.release();
    }
  },

  async findPostsWithCommentsAndUsers() {
    const connection = await pool.getConnection();
    try {
      const result = await connection.query(`
        SELECT 
          p.id, p.title, p.content, p.views,
          u.name as author_name,
          c.id as comment_id, c.content as comment_content,
          cu.name as commenter_name
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN comments c ON p.id = c.post_id
        LEFT JOIN users cu ON c.user_id = cu.id
        WHERE p.published = true
        LIMIT 1000
      `);
      
      return result.rows;
    } finally {
      connection.release();
    }
  },

  // Batch operations
  async insertUsers(users: any[]) {
    const connection = await pool.getConnection();
    const uow = new UnitOfWork({
      enableChangeTracking: false,
      transaction: true,
    });
    
    uow.setConnection(connection);
    uow.registerEntity({
      entity: 'User',
      table: 'users',
      primaryKey: 'id',
      columns: new Map([
        ['id', 'id'],
        ['email', 'email'],
        ['name', 'name'],
        ['age', 'age'],
        ['isActive', 'is_active'],
      ]),
    });

    try {
      for (const userData of users) {
        uow.create('User', userData);
      }
      
      return await uow.commit();
    } finally {
      connection.release();
    }
  },

  async updateUsersBatch(updates: { id: number; name: string }[]) {
    const connection = await pool.getConnection();
    try {
      const values = updates.map(u => `(${u.id}, '${u.name}')`).join(', ');
      await connection.query(`
        UPDATE users SET 
          name = data.name,
          updated_at = NOW()
        FROM (VALUES ${values}) AS data(id, name)
        WHERE users.id = data.id
      `);
    } finally {
      connection.release();
    }
  },

  // Memory efficiency tests
  async loadLargeDataset() {
    return createQueryBuilder(PostSchema)
      .where({ published: true })
      .limit(10000)
      .many();
  },

  async loadWithIdentityMap() {
    const connection = await pool.getConnection();
    const uow = new UnitOfWork({
      enableChangeTracking: true,
      transaction: false,
    });
    
    uow.setConnection(connection);
    uow.registerEntity({
      entity: 'User',
      table: 'users',
      primaryKey: 'id',
      columns: new Map([
        ['id', 'id'],
        ['email', 'email'],
        ['name', 'name'],
      ]),
    });

    try {
      // Load same users multiple times - should use Identity Map
      const results = [];
      for (let i = 1; i <= 100; i++) {
        const user = await connection.query('SELECT * FROM users WHERE id = $1', [i]);
        if (user.rows[0]) {
          results.push(uow.attach('User', user.rows[0]));
        }
      }
      
      // Load same users again - should come from Identity Map
      for (let i = 1; i <= 100; i++) {
        const user = await connection.query('SELECT * FROM users WHERE id = $1', [i]);
        if (user.rows[0]) {
          results.push(uow.attach('User', user.rows[0]));
        }
      }
      
      return results;
    } finally {
      connection.release();
    }
  },

  // Transaction tests
  async complexTransactionTest() {
    const connection = await pool.getConnection();
    const uow = new UnitOfWork({
      enableChangeTracking: true,
      transaction: true,
    });
    
    uow.setConnection(connection);
    uow.registerEntity({
      entity: 'User',
      table: 'users',
      primaryKey: 'id',
      columns: new Map([
        ['id', 'id'],
        ['email', 'email'],
        ['name', 'name'],
        ['age', 'age'],
      ]),
    });

    try {
      // Create new user
      const newUser = uow.create('User', {
        email: `benchmark${Date.now()}@example.com`,
        name: 'Benchmark User',
        age: 25,
      });

      // Update existing user
      const existingUser = await connection.query('SELECT * FROM users WHERE id = 1');
      if (existingUser.rows[0]) {
        const user = uow.attach('User', existingUser.rows[0]);
        user.name = 'Updated Name';
      }

      return await uow.commit();
    } finally {
      connection.release();
    }
  },

  async cleanup() {
    await pool.close();
  }
};