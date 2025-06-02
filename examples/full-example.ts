/**
 * Comprehensive example showing Hyperion ORM features
 * Demonstrates Identity Map, Unit of Work, and Type-Safe Schema
 */

import { UnitOfWork, Connection } from '../src/core/index.js';
import { schema, column } from '../src/schema/index.js';
import type { InferEntity } from '../src/schema/index.js';

// Define our schemas with full type safety
const UserSchema = schema('User', {
  id: column.uuid().primary().default('gen_random_uuid()'),
  email: column.string().unique(),
  name: column.string(),
  age: column.number().nullable(),
  createdAt: column.timestamp().default('now()'),
})
  .tableName('users')
  .indexes(
    { columns: ['email'], unique: true },
    { columns: ['createdAt'] }
  )
  .build();

const PostSchema = schema('Post', {
  id: column.uuid().primary().default('gen_random_uuid()'),
  title: column.string(),
  content: column.text(),
  authorId: column.uuid(),
  published: column.boolean().default(false),
  createdAt: column.timestamp().default('now()'),
})
  .tableName('posts')
  .indexes(
    { columns: ['authorId'] },
    { columns: ['published', 'createdAt'] }
  )
  .build();

// Type inference gives us fully typed entities
type User = InferEntity<typeof UserSchema>;
type Post = InferEntity<typeof PostSchema>;

async function example() {
  // Initialize connection (in real app, would be a real connection)
  const connection = new Connection({
    host: 'localhost',
    port: 5432,
    database: 'hyperion_example',
    user: 'postgres',
    password: 'password',
  });

  // Create Unit of Work
  const uow = new UnitOfWork({
    enableChangeTracking: true,
    autoFlush: false,
  });
  
  uow.setConnection(connection);

  // Register entity metadata for SQL generation
  uow.registerEntity({
    entity: 'User',
    table: 'users',
    primaryKey: 'id',
    columns: new Map([
      ['id', 'id'],
      ['email', 'email'],
      ['name', 'name'],
      ['age', 'age'],
      ['createdAt', 'created_at'],
    ]),
  });

  uow.registerEntity({
    entity: 'Post',
    table: 'posts',
    primaryKey: 'id',
    columns: new Map([
      ['id', 'id'],
      ['title', 'title'],
      ['content', 'content'],
      ['authorId', 'author_id'],
      ['published', 'published'],
      ['createdAt', 'created_at'],
    ]),
  });

  // Example 1: Creating new entities
  console.log('=== Creating New Entities ===');
  
  const newUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'alice@example.com',
    name: 'Alice Johnson',
    age: 28,
    createdAt: new Date(),
  };

  // Create user - automatically tracked as new
  const alice = uow.create('User', newUser);
  console.log('Created user:', alice.name);

  // Create posts for the user
  const post1 = uow.create('Post', {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Introduction to Hyperion ORM',
    content: 'Hyperion is a type-safe ORM for TypeScript...',
    authorId: alice.id,
    published: true,
    createdAt: new Date(),
  });

  const post2 = uow.create('Post', {
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: 'Advanced Patterns in Hyperion',
    content: 'Let\'s explore Unit of Work and Identity Map...',
    authorId: alice.id,
    published: false,
    createdAt: new Date(),
  });

  // Check pending changes
  console.log('\nPending changes:', uow.getChanges().length); // 3 (1 user + 2 posts)

  // Example 2: Identity Map in action
  console.log('\n=== Identity Map Demo ===');
  
  // Try to create the same user again - Identity Map returns existing instance
  const sameUser = uow.create('User', {
    id: alice.id,
    email: 'different@example.com', // Different data
    name: 'Different Name',
    age: 30,
    createdAt: new Date(),
  });

  console.log('Same reference?', sameUser === alice); // true
  console.log('Original data preserved:', sameUser.email); // alice@example.com

  // Example 3: Change tracking
  console.log('\n=== Change Tracking Demo ===');
  
  // Load existing user (simulating data from DB)
  const existingUser = uow.get('User', '550e8400-e29b-41d4-a716-446655440004', {
    id: '550e8400-e29b-41d4-a716-446655440004',
    email: 'bob@example.com',
    name: 'Bob Smith',
    age: 35,
    createdAt: new Date('2024-01-01'),
  })!;

  console.log('Initial user:', existingUser.name);
  
  // Modify the user - changes are automatically tracked
  existingUser.name = 'Robert Smith';
  existingUser.age = 36;

  // Check what changed
  const changes = uow.getChanges();
  const userChange = changes.find(c => c.entity === 'User' && c.type === 'updated');
  console.log('Changed fields:', Array.from(userChange?.changedFields || [])); // ['name', 'age']

  // Example 4: Nested object changes
  console.log('\n=== Nested Change Tracking ===');
  
  type UserWithProfile = User & { profile?: { bio: string; website: string } };
  
  const userWithProfile = uow.get('User', '550e8400-e29b-41d4-a716-446655440005', {
    id: '550e8400-e29b-41d4-a716-446655440005',
    email: 'charlie@example.com',
    name: 'Charlie Brown',
    age: 25,
    createdAt: new Date(),
    profile: {
      bio: 'Software developer',
      website: 'https://charlie.dev',
    },
  } as UserWithProfile)!;

  // Modify nested object - tracked!
  userWithProfile.profile!.bio = 'Senior software developer';
  
  // Example 5: Deletion
  console.log('\n=== Deletion Demo ===');
  
  const toDelete = uow.get('Post', '550e8400-e29b-41d4-a716-446655440006', {
    id: '550e8400-e29b-41d4-a716-446655440006',
    title: 'Post to Delete',
    content: 'This will be deleted',
    authorId: alice.id,
    published: false,
    createdAt: new Date(),
  })!;

  uow.delete('Post', toDelete.id);
  
  // Example 6: Statistics
  console.log('\n=== Unit of Work Statistics ===');
  const stats = uow.getStats();
  console.log('Identity Map:', stats.identityMap);
  console.log('Change Tracker:', stats.changeTracker);

  // Example 7: Committing changes
  console.log('\n=== Committing Changes ===');
  
  try {
    // In a real app, this would execute SQL
    // const result = await uow.commit();
    // console.log('Commit result:', result);
    
    // For demo, just show what would be committed
    const allChanges = uow.getChanges();
    console.log(`Would commit ${allChanges.length} changes:`);
    
    allChanges.forEach(change => {
      console.log(`- ${change.type} ${change.entity} ${JSON.stringify(change.id)}`);
      if (change.type === 'updated' && change.changedFields) {
        console.log(`  Changed: ${Array.from(change.changedFields).join(', ')}`);
      }
    });
  } catch (error) {
    console.error('Commit failed:', error);
    // Transaction would be rolled back
  }

  // Example 8: Type safety prevents errors
  console.log('\n=== Type Safety Demo ===');
  
  // These would cause TypeScript errors:
  // alice.email = null; // Error: Type 'null' is not assignable to type 'string'
  // alice.age = 'thirty'; // Error: Type 'string' is not assignable to type 'number | null'
  // alice.nonExistent = 'value'; // Error: Property 'nonExistent' does not exist
  
  console.log('Type safety prevents runtime errors!');

  // Clean up
  uow.close();
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}