import { describe, it, expect, beforeEach } from 'vitest';
import { createQueryBuilder, raw } from './builder.js';
import { schema, column } from '../schema/builder.js';

// Test schemas
const UserSchema = schema('User', {
  id: column.uuid().primary(),
  email: column.string().unique(),
  name: column.string(),
  age: column.number().nullable(),
  isActive: column.boolean().default(true),
  createdAt: column.timestamp().default('now()'),
})
  .tableName('users')
  .build();

const PostSchema = schema('Post', {
  id: column.uuid().primary(),
  title: column.string(),
  content: column.text(),
  authorId: column.uuid(),
  published: column.boolean().default(false),
  viewCount: column.number().default(0),
  publishedAt: column.timestamp().nullable(),
})
  .tableName('posts')
  .build();

describe('QueryBuilder', () => {
  describe('basic queries', () => {
    it('should build simple select query', () => {
      const qb = createQueryBuilder(UserSchema);
      const { sql, parameters } = qb.toSQL();
      
      expect(sql).toBe('SELECT * FROM users');
      expect(parameters).toEqual([]);
    });

    it('should select specific fields', () => {
      const qb = createQueryBuilder(UserSchema)
        .select('id', 'name', 'email');
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT id, name, email FROM users');
    });

    it('should handle select with aliases', () => {
      const qb = createQueryBuilder(UserSchema)
        .selectAs({
          userId: 'id',
          userName: 'name',
          userEmail: 'email',
        });
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT id AS userId, name AS userName, email AS userEmail FROM users');
    });

    it('should handle raw SQL in select', () => {
      const qb = createQueryBuilder(UserSchema)
        .selectAs({
          id: 'id',
          fullName: raw('CONCAT(name, \' <\', email, \'>\')')
        });
      
      const { sql } = qb.toSQL();
      expect(sql).toContain('(CONCAT(name, \' <\', email, \'>\')) AS fullName');
    });
  });

  describe('where conditions', () => {
    it('should handle simple equality', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ email: 'john@example.com' });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE email = $1');
      expect(parameters).toEqual(['john@example.com']);
    });

    it('should handle multiple conditions', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          email: 'john@example.com',
          isActive: true,
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE email = $1 AND isActive = $2');
      expect(parameters).toEqual(['john@example.com', true]);
    });

    it('should handle null values', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ age: null });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE age IS NULL');
      expect(parameters).toEqual([]);
    });

    it('should handle operators', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          age: { gte: 18, lt: 65 },
          name: { like: 'John%' },
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE age >= $1 AND age < $2 AND name LIKE $3');
      expect(parameters).toEqual([18, 65, 'John%']);
    });

    it('should handle IN operator', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          id: { in: ['id1', 'id2', 'id3'] }
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE id IN ($1, $2, $3)');
      expect(parameters).toEqual(['id1', 'id2', 'id3']);
    });

    it('should handle NOT IN operator', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          id: { notIn: ['id1', 'id2'] }
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE id NOT IN ($1, $2)');
      expect(parameters).toEqual(['id1', 'id2']);
    });

    it('should handle BETWEEN operator', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          age: { between: [18, 65] }
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE age BETWEEN $1 AND $2');
      expect(parameters).toEqual([18, 65]);
    });

    it('should handle string operators', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          name: { startsWith: 'John' },
          email: { endsWith: '@example.com' },
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE name LIKE $1 AND email LIKE $2');
      expect(parameters).toEqual(['John%', '%@example.com']);
    });

    it('should handle OR conditions', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          OR: [
            { email: 'john@example.com' },
            { email: 'jane@example.com' },
          ]
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE (email = $1 OR email = $2)');
      expect(parameters).toEqual(['john@example.com', 'jane@example.com']);
    });

    it('should handle AND conditions', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          AND: [
            { age: { gte: 18 } },
            { isActive: true },
          ]
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE (age >= $1 AND isActive = $2)');
      expect(parameters).toEqual([18, true]);
    });

    it('should handle NOT conditions', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          NOT: { email: 'banned@example.com' }
        });
      
      const { sql, parameters } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users WHERE NOT (email = $1)');
      expect(parameters).toEqual(['banned@example.com']);
    });

    it('should handle complex nested conditions', () => {
      const qb = createQueryBuilder(UserSchema)
        .where({ 
          OR: [
            { 
              AND: [
                { age: { gte: 18 } },
                { isActive: true }
              ]
            },
            { email: { like: '%@admin.com' } }
          ]
        });
      
      const { sql } = qb.toSQL();
      expect(sql).toContain('((age >= $1 AND isActive = $2) OR email LIKE $3)');
    });
  });

  describe('order by', () => {
    it('should handle simple order by', () => {
      const qb = createQueryBuilder(UserSchema)
        .orderBy({ createdAt: 'desc' });
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users ORDER BY createdAt DESC');
    });

    it('should handle multiple order by', () => {
      const qb = createQueryBuilder(UserSchema)
        .orderBy({ 
          isActive: 'desc',
          name: 'asc',
        });
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users ORDER BY isActive DESC, name ASC');
    });

    it('should handle order by array', () => {
      const qb = createQueryBuilder(UserSchema)
        .orderBy([
          { createdAt: 'desc' },
          { name: 'asc' },
        ]);
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users ORDER BY createdAt DESC, name ASC');
    });
  });

  describe('pagination', () => {
    it('should handle limit', () => {
      const qb = createQueryBuilder(UserSchema)
        .limit(10);
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users LIMIT 10');
    });

    it('should handle offset', () => {
      const qb = createQueryBuilder(UserSchema)
        .offset(20);
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users OFFSET 20');
    });

    it('should handle limit and offset together', () => {
      const qb = createQueryBuilder(UserSchema)
        .limit(10)
        .offset(20);
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users LIMIT 10 OFFSET 20');
    });
  });

  describe('distinct', () => {
    it('should handle simple distinct', () => {
      const qb = createQueryBuilder(UserSchema)
        .distinct();
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT DISTINCT * FROM users');
    });

    it('should handle distinct on specific columns', () => {
      const qb = createQueryBuilder(UserSchema)
        .distinct(['email']);
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT DISTINCT ON (email) * FROM users');
    });

    it('should handle distinct on multiple columns', () => {
      const qb = createQueryBuilder(UserSchema)
        .distinct(['email', 'name']);
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT DISTINCT ON (email, name) * FROM users');
    });
  });

  describe('group by and having', () => {
    it('should handle group by', () => {
      const qb = createQueryBuilder(PostSchema)
        .select('authorId')
        .groupBy('authorId');
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT authorId FROM posts GROUP BY authorId');
    });

    it('should handle group by multiple columns', () => {
      const qb = createQueryBuilder(PostSchema)
        .select('authorId', 'published')
        .groupBy('authorId', 'published');
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT authorId, published FROM posts GROUP BY authorId, published');
    });

    it('should handle having clause', () => {
      const qb = createQueryBuilder(PostSchema)
        .selectAs({ authorId: 'authorId', postCount: raw('COUNT(*)') })
        .groupBy('authorId')
        .having({ postCount: { gte: 5 } });
      
      const { sql } = qb.toSQL();
      expect(sql).toContain('GROUP BY authorId HAVING postCount >= $1');
    });
  });

  describe('joins', () => {
    it('should handle inner join', () => {
      const qb = createQueryBuilder(UserSchema)
        .innerJoin(PostSchema, join => 
          join.on('id', 'authorId')
        );
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users INNER JOIN posts ON id = authorId');
    });

    it('should handle left join', () => {
      const qb = createQueryBuilder(UserSchema)
        .leftJoin(PostSchema, join => 
          join.on('id', 'authorId')
        );
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users LEFT JOIN posts ON id = authorId');
    });

    it('should handle multiple join conditions', () => {
      const qb = createQueryBuilder(UserSchema)
        .innerJoin(PostSchema, join => 
          join
            .on('id', 'authorId')
            .and('isActive', 'published')
        );
      
      const { sql } = qb.toSQL();
      expect(sql).toBe('SELECT * FROM users INNER JOIN posts ON id = authorId AND isActive = published');
    });
  });

  describe('complex queries', () => {
    it('should handle complex query with all features', () => {
      const qb = createQueryBuilder(UserSchema)
        .select('id', 'name', 'email')
        .where({
          isActive: true,
          age: { gte: 18 },
          OR: [
            { email: { like: '%@company.com' } },
            { name: { startsWith: 'Admin' } },
          ],
        })
        .orderBy({ createdAt: 'desc', name: 'asc' })
        .limit(20)
        .offset(40);
      
      const { sql, parameters } = qb.toSQL();
      
      expect(sql).toContain('SELECT id, name, email FROM users');
      expect(sql).toContain('WHERE isActive = $1 AND age >= $2');
      expect(sql).toContain('ORDER BY createdAt DESC, name ASC');
      expect(sql).toContain('LIMIT 20 OFFSET 40');
      expect(parameters).toHaveLength(4);
    });

    it('should build query for finding users with posts', () => {
      const qb = createQueryBuilder(UserSchema)
        .selectAs({
          userId: 'id',
          userName: 'name',
          postCount: raw('COUNT(posts.id)'),
        })
        .leftJoin(PostSchema, join => join.on('id', 'authorId'))
        .where({ isActive: true })
        .groupBy('id', 'name')
        .having({ postCount: { gte: 1 } })
        .orderBy({ postCount: 'desc' });
      
      const { sql } = qb.toSQL();
      
      expect(sql).toContain('LEFT JOIN posts ON id = authorId');
      expect(sql).toContain('GROUP BY id, name');
      expect(sql).toContain('HAVING postCount >= $2');
      expect(sql).toContain('ORDER BY postCount DESC');
    });
  });

  describe('type safety', () => {
    it('should enforce correct field types in where conditions', () => {
      const qb = createQueryBuilder(UserSchema);
      
      // These should compile
      qb.where({ age: 25 });
      qb.where({ age: null });
      qb.where({ age: { gte: 18 } });
      qb.where({ isActive: true });
      qb.where({ email: { like: '%@example.com' } });
      
      // TypeScript would prevent these at compile time:
      // qb.where({ age: 'twenty-five' }); // Error: string not assignable to number
      // qb.where({ isActive: 'yes' }); // Error: string not assignable to boolean
      // qb.where({ nonExistentField: 'value' }); // Error: field doesn't exist
    });

    it('should enforce correct operators for field types', () => {
      const qb = createQueryBuilder(UserSchema);
      
      // String operators
      qb.where({ email: { like: '%@example.com' } });
      qb.where({ email: { startsWith: 'john' } });
      
      // Number operators
      qb.where({ age: { gte: 18, lte: 65 } });
      qb.where({ age: { between: [18, 65] } });
      
      // Boolean operators
      qb.where({ isActive: { eq: true } });
      
      // TypeScript would prevent invalid operators:
      // qb.where({ age: { like: '18' } }); // Error: 'like' not valid for numbers
      // qb.where({ email: { gte: 'a' } }); // Error: 'gte' not valid for strings
    });
  });
});