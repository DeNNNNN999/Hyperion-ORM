/**
 * Drizzle ORM configuration for benchmarks
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, serial, varchar, integer, boolean, timestamp, text } from 'drizzle-orm/pg-core';
import { eq, and } from 'drizzle-orm';
import { Pool } from 'pg';

// Schema definitions
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  age: integer('age'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  userId: integer('user_id').references(() => users.id),
  views: integer('views').default(0),
  published: boolean('published').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  postId: integer('post_id').references(() => posts.id),
  userId: integer('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
});

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'orm_benchmark',
  user: 'postgres',
  password: 'password',
  max: 20,
});

export const db = drizzle(pool);

export const drizzleORM = {
  name: 'Drizzle',
  
  // Simple queries
  async findUserById(id: number) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  },

  async findUserByEmail(email: string) {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  },

  async findActiveUsers() {
    return db.select().from(users).where(eq(users.isActive, true));
  },

  // Complex queries with joins
  async findUserWithPosts(userId: number) {
    return db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      postId: posts.id,
      title: posts.title,
      content: posts.content,
      views: posts.views,
      published: posts.published,
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.userId))
    .where(eq(users.id, userId));
  },

  async findPostsWithCommentsAndUsers() {
    return db.select({
      postId: posts.id,
      title: posts.title,
      content: posts.content,
      views: posts.views,
      authorName: users.name,
      commentId: comments.id,
      commentContent: comments.content,
    })
    .from(posts)
    .innerJoin(users, eq(posts.userId, users.id))
    .leftJoin(comments, eq(posts.id, comments.postId))
    .where(eq(posts.published, true))
    .limit(1000);
  },

  // Batch operations
  async insertUsers(users: any[]) {
    return db.insert(users).values(users.map(u => ({
      email: u.email,
      name: u.name,
      age: u.age,
      isActive: u.isActive
    })));
  },

  async updateUsersBatch(updates: { id: number; name: string }[]) {
    const promises = updates.map(update => 
      db.update(users)
        .set({ name: update.name })
        .where(eq(users.id, update.id))
    );
    return Promise.all(promises);
  },

  // Memory efficiency tests
  async loadLargeDataset() {
    return db.select().from(posts).where(eq(posts.published, true)).limit(10000);
  },

  async loadWithIdentityMap() {
    // Drizzle doesn't have built-in Identity Map
    const results = [];
    
    // Load same users multiple times
    for (let i = 1; i <= 100; i++) {
      const user = await db.select().from(users).where(eq(users.id, i)).limit(1);
      if (user[0]) results.push(user[0]);
    }
    
    // Load same users again
    for (let i = 1; i <= 100; i++) {
      const user = await db.select().from(users).where(eq(users.id, i)).limit(1);
      if (user[0]) results.push(user[0]);
    }
    
    return results;
  },

  // Transaction tests
  async complexTransactionTest() {
    return db.transaction(async (tx) => {
      // Create new user
      const newUser = await tx.insert(users).values({
        email: `benchmark${Date.now()}@example.com`,
        name: 'Benchmark User',
        age: 25
      }).returning();

      // Update existing user
      const updatedUser = await tx.update(users)
        .set({ name: 'Updated Name' })
        .where(eq(users.id, 1))
        .returning();

      return { newUser: newUser[0], updatedUser: updatedUser[0] };
    });
  },

  async cleanup() {
    await pool.end();
  }
};