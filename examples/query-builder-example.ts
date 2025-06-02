/**
 * Advanced Query Builder examples with perfect TypeScript inference
 */

import { createQueryBuilder, raw } from '../src/query/builder.js';
import { schema, column } from '../src/schema/builder.js';
import type { InferEntity } from '../src/schema/types.js';

// Define schemas
const UserSchema = schema('User', {
  id: column.uuid().primary(),
  email: column.string().unique(),
  name: column.string(),
  age: column.number().nullable(),
  role: column.string().default('user'),
  isActive: column.boolean().default(true),
  lastLoginAt: column.timestamp().nullable(),
  createdAt: column.timestamp().default('now()'),
})
  .tableName('users')
  .build();

const PostSchema = schema('Post', {
  id: column.uuid().primary(),
  title: column.string(),
  content: column.text(),
  authorId: column.uuid(),
  categoryId: column.uuid().nullable(),
  published: column.boolean().default(false),
  viewCount: column.number().default(0),
  tags: column.json<string[]>().default([]),
  publishedAt: column.timestamp().nullable(),
  createdAt: column.timestamp().default('now()'),
  updatedAt: column.timestamp().default('now()'),
})
  .tableName('posts')
  .build();

const CommentSchema = schema('Comment', {
  id: column.uuid().primary(),
  postId: column.uuid(),
  userId: column.uuid(),
  content: column.text(),
  likes: column.number().default(0),
  createdAt: column.timestamp().default('now()'),
})
  .tableName('comments')
  .build();

// Type inference
type User = InferEntity<typeof UserSchema>;
type Post = InferEntity<typeof PostSchema>;
type Comment = InferEntity<typeof CommentSchema>;

async function queryExamples() {
  // Example 1: Simple queries with type safety
  console.log('=== Simple Queries ===');
  
  // Find active users - TypeScript knows the result type
  const activeUsers = await createQueryBuilder(UserSchema)
    .where({ isActive: true })
    .orderBy({ createdAt: 'desc' })
    .limit(10)
    .many();
  
  // Type: User[]
  activeUsers.forEach(user => {
    console.log(user.email); // TypeScript knows this is string
    console.log(user.age); // TypeScript knows this is number | null
  });

  // Example 2: Complex where conditions
  console.log('\n=== Complex Where Conditions ===');
  
  const complexQuery = createQueryBuilder(UserSchema)
    .where({
      OR: [
        {
          AND: [
            { role: 'admin' },
            { lastLoginAt: { gte: new Date('2024-01-01') } }
          ]
        },
        {
          AND: [
            { role: 'moderator' },
            { isActive: true }
          ]
        }
      ],
      age: { between: [18, 65] },
      email: { notLike: '%@spam.com' }
    })
    .orderBy([
      { role: 'asc' },
      { lastLoginAt: 'desc' }
    ]);

  console.log('SQL:', complexQuery.toSQL().sql);

  // Example 3: Selecting specific fields
  console.log('\n=== Field Selection ===');
  
  // Select only specific fields - TypeScript knows the result shape
  const userSummaries = await createQueryBuilder(UserSchema)
    .select('id', 'name', 'email')
    .where({ isActive: true })
    .many();
  
  // Type: Pick<User, 'id' | 'name' | 'email'>[]
  userSummaries.forEach(summary => {
    console.log(summary.name); // OK
    // console.log(summary.age); // TypeScript Error: Property 'age' does not exist
  });

  // Example 4: Aliases and computed fields
  console.log('\n=== Aliases and Computed Fields ===');
  
  const usersWithAge = await createQueryBuilder(UserSchema)
    .selectAs({
      userId: 'id',
      userName: 'name',
      ageGroup: raw(`
        CASE 
          WHEN age < 18 THEN 'minor'
          WHEN age BETWEEN 18 AND 65 THEN 'adult'
          ELSE 'senior'
        END
      `),
      daysSinceLogin: raw('EXTRACT(DAY FROM NOW() - lastLoginAt)')
    })
    .where({ isActive: true })
    .many();

  // Example 5: Aggregations
  console.log('\n=== Aggregations ===');
  
  // Count users by role
  const userCountByRole = await createQueryBuilder(UserSchema)
    .selectAs({
      role: 'role',
      count: raw('COUNT(*)'),
      avgAge: raw('AVG(age)'),
      lastLogin: raw('MAX(lastLoginAt)')
    })
    .groupBy('role')
    .having({ count: { gte: 5 } })
    .orderBy({ count: 'desc' })
    .many();

  // Built-in aggregation functions
  const totalUsers = await createQueryBuilder(UserSchema).count();
  const avgAge = await createQueryBuilder(UserSchema).avg('age');
  const oldestUser = await createQueryBuilder(UserSchema).max('age');
  
  console.log(`Total users: ${totalUsers}`);
  console.log(`Average age: ${avgAge}`);
  console.log(`Oldest user age: ${oldestUser}`);

  // Example 6: Joins
  console.log('\n=== Joins ===');
  
  // Find users with their post counts
  const usersWithPosts = await createQueryBuilder(UserSchema)
    .selectAs({
      userId: 'users.id',
      userName: 'users.name',
      email: 'users.email',
      postCount: raw('COUNT(posts.id)'),
      publishedCount: raw('COUNT(posts.id) FILTER (WHERE posts.published = true)')
    })
    .leftJoin(PostSchema, join => 
      join.on('id', 'authorId')
    )
    .groupBy('users.id', 'users.name', 'users.email')
    .having({ postCount: { gte: 1 } })
    .orderBy({ postCount: 'desc' })
    .limit(10)
    .many();

  // Example 7: Subqueries
  console.log('\n=== Subqueries ===');
  
  // Find posts by users who have commented recently
  const activeCommenters = createQueryBuilder(CommentSchema)
    .select('userId')
    .distinct()
    .where({ createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
    .toSQL();

  const postsByActiveCommenters = await createQueryBuilder(PostSchema)
    .where({
      authorId: { in: raw(`(${activeCommenters.sql})`, ...activeCommenters.parameters) },
      published: true
    })
    .orderBy({ viewCount: 'desc' })
    .limit(20)
    .many();

  // Example 8: Complex join query
  console.log('\n=== Complex Join Query ===');
  
  // Find posts with author info and comment counts
  const postsWithDetails = createQueryBuilder(PostSchema)
    .selectAs({
      postId: 'posts.id',
      title: 'posts.title',
      authorName: 'users.name',
      authorEmail: 'users.email',
      commentCount: raw('COUNT(DISTINCT comments.id)'),
      uniqueCommenters: raw('COUNT(DISTINCT comments.userId)'),
      avgLikes: raw('AVG(comments.likes)'),
      published: 'posts.published',
      viewCount: 'posts.viewCount'
    })
    .innerJoin(UserSchema, join => 
      join.on('authorId', 'id')
    )
    .leftJoin(CommentSchema, join => 
      join.on('posts.id', 'postId')
    )
    .where({
      'posts.published': true,
      'posts.createdAt': { gte: new Date('2024-01-01') },
      'users.isActive': true
    })
    .groupBy(
      'posts.id', 
      'posts.title', 
      'users.name', 
      'users.email',
      'posts.published',
      'posts.viewCount'
    )
    .having({ commentCount: { gte: 5 } })
    .orderBy([
      { viewCount: 'desc' },
      { commentCount: 'desc' }
    ])
    .limit(10);

  console.log('Complex query SQL:', postsWithDetails.toSQL().sql);

  // Example 9: Using operators effectively
  console.log('\n=== Advanced Operators ===');
  
  // String operators
  const searchResults = await createQueryBuilder(PostSchema)
    .where({
      OR: [
        { title: { contains: 'TypeScript' } },
        { content: { contains: 'TypeScript' } },
        { title: { ilike: '%orm%' } } // Case-insensitive
      ],
      published: true
    })
    .many();

  // Date operators
  const recentPosts = await createQueryBuilder(PostSchema)
    .where({
      publishedAt: { 
        gte: new Date('2024-01-01'),
        lt: new Date('2024-12-31')
      }
    })
    .many();

  // Array operators (for JSON columns)
  const taggedPosts = await createQueryBuilder(PostSchema)
    .where({
      tags: { contains: ['typescript', 'orm'] }
    })
    .many();

  // Example 10: Pagination helper
  console.log('\n=== Pagination ===');
  
  async function paginate<T>(
    query: any,
    page: number,
    pageSize: number
  ): Promise<{ data: T[]; total: number; pages: number }> {
    const total = await query.count();
    const pages = Math.ceil(total / pageSize);
    
    const data = await query
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .many();
    
    return { data, total, pages };
  }

  const paginatedUsers = await paginate(
    createQueryBuilder(UserSchema).where({ isActive: true }),
    2, // page 2
    20  // 20 items per page
  );

  console.log(`Page 2 of ${paginatedUsers.pages} (${paginatedUsers.total} total)`);

  // Example 11: Type safety prevents errors
  console.log('\n=== Type Safety ===');
  
  // TypeScript catches these errors at compile time:
  
  // Wrong field type
  // createQueryBuilder(UserSchema).where({ age: 'twenty' }); 
  // Error: Type 'string' is not assignable to type 'number | null'
  
  // Invalid operator for field type
  // createQueryBuilder(UserSchema).where({ age: { like: '20' } });
  // Error: 'like' is not a valid operator for number fields
  
  // Non-existent field
  // createQueryBuilder(UserSchema).where({ nonExistent: 'value' });
  // Error: 'nonExistent' does not exist in type
  
  // Wrong join field
  // createQueryBuilder(UserSchema).innerJoin(PostSchema, join => 
  //   join.on('nonExistent', 'authorId')
  // );
  // Error: 'nonExistent' is not assignable to keyof User columns

  console.log('Type safety prevents runtime errors!');
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  queryExamples().catch(console.error);
}