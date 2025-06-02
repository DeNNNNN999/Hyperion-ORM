/**
 * Database setup for ORM benchmarks
 * Creates test database with realistic data for performance comparison
 */

import { Pool } from 'pg';
import chalk from 'chalk';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'password',
});

async function setupDatabase() {
  console.log(chalk.blue('🔨 Setting up benchmark database...'));

  try {
    // Create benchmark database
    await pool.query('DROP DATABASE IF EXISTS orm_benchmark');
    await pool.query('CREATE DATABASE orm_benchmark');
    
    // Connect to the new database
    const benchmarkPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'orm_benchmark',
      user: 'postgres',
      password: 'password',
    });

    // Create tables
    console.log(chalk.yellow('📋 Creating tables...'));
    
    await benchmarkPool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        age INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await benchmarkPool.query(`
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        user_id INTEGER REFERENCES users(id),
        views INTEGER DEFAULT 0,
        published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await benchmarkPool.query(`
      CREATE TABLE comments (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        post_id INTEGER REFERENCES posts(id),
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await benchmarkPool.query(`
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT
      )
    `);

    await benchmarkPool.query(`
      CREATE TABLE post_categories (
        post_id INTEGER REFERENCES posts(id),
        category_id INTEGER REFERENCES categories(id),
        PRIMARY KEY (post_id, category_id)
      )
    `);

    // Create indexes for performance
    await benchmarkPool.query('CREATE INDEX idx_posts_user_id ON posts(user_id)');
    await benchmarkPool.query('CREATE INDEX idx_comments_post_id ON comments(post_id)');
    await benchmarkPool.query('CREATE INDEX idx_comments_user_id ON comments(user_id)');
    await benchmarkPool.query('CREATE INDEX idx_users_email ON users(email)');
    await benchmarkPool.query('CREATE INDEX idx_posts_published ON posts(published)');

    // Generate test data
    console.log(chalk.yellow('📊 Generating test data...'));
    
    // Generate users (10,000)
    const userBatches = [];
    for (let i = 0; i < 100; i++) {
      const values = [];
      for (let j = 0; j < 100; j++) {
        const id = i * 100 + j + 1;
        values.push(`('user${id}@example.com', 'User ${id}', ${20 + (id % 60)}, ${id % 2 === 0})`);
      }
      userBatches.push(`INSERT INTO users (email, name, age, is_active) VALUES ${values.join(', ')}`);
    }

    for (const batch of userBatches) {
      await benchmarkPool.query(batch);
    }

    // Generate categories (50)
    const categoryValues = [];
    for (let i = 1; i <= 50; i++) {
      categoryValues.push(`('Category ${i}', 'Description for category ${i}')`);
    }
    await benchmarkPool.query(`INSERT INTO categories (name, description) VALUES ${categoryValues.join(', ')}`);

    // Generate posts (50,000)
    console.log(chalk.yellow('📝 Generating posts...'));
    for (let i = 0; i < 500; i++) {
      const values = [];
      for (let j = 0; j < 100; j++) {
        const id = i * 100 + j + 1;
        const userId = (id % 10000) + 1;
        const views = Math.floor(Math.random() * 1000);
        const published = id % 3 !== 0;
        values.push(`('Post ${id} Title', 'Content for post ${id}...', ${userId}, ${views}, ${published})`);
      }
      await benchmarkPool.query(`INSERT INTO posts (title, content, user_id, views, published) VALUES ${values.join(', ')}`);
    }

    // Generate comments (200,000)
    console.log(chalk.yellow('💬 Generating comments...'));
    for (let i = 0; i < 1000; i++) {
      const values = [];
      for (let j = 0; j < 200; j++) {
        const commentId = i * 200 + j + 1;
        const postId = (commentId % 50000) + 1;
        const userId = (commentId % 10000) + 1;
        values.push(`('Comment ${commentId} content', ${postId}, ${userId})`);
      }
      await benchmarkPool.query(`INSERT INTO comments (content, post_id, user_id) VALUES ${values.join(', ')}`);
    }

    // Generate post-category relationships
    console.log(chalk.yellow('🔗 Generating relationships...'));
    for (let postId = 1; postId <= 50000; postId++) {
      const categoryCount = Math.floor(Math.random() * 3) + 1;
      const categories = new Set();
      
      while (categories.size < categoryCount) {
        categories.add(Math.floor(Math.random() * 50) + 1);
      }
      
      const values = Array.from(categories).map(catId => `(${postId}, ${catId})`);
      await benchmarkPool.query(`INSERT INTO post_categories (post_id, category_id) VALUES ${values.join(', ')}`);
    }

    // Update statistics
    await benchmarkPool.query('ANALYZE');

    await benchmarkPool.end();
    
    console.log(chalk.green('✅ Database setup completed!'));
    console.log(chalk.cyan(`📊 Generated data:
    - Users: 10,000
    - Posts: 50,000  
    - Comments: 200,000
    - Categories: 50
    - Post-Category relationships: ~100,000`));

  } catch (error) {
    console.error(chalk.red('❌ Database setup failed:'), error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase().catch(console.error);
}

export { setupDatabase };