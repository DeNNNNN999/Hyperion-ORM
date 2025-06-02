/**
 * Example demonstrating the type-safe schema definition system
 */

import { schema, column } from '../src/schema/builder.js';
import { hasMany, hasOne, belongsTo, belongsToMany } from '../src/schema/types.js';
import type { InferEntity } from '../src/schema/types.js';

// Define User schema
const UserSchema = schema('User', {
  id: column.uuid().primary().default('gen_random_uuid()'),
  email: column.string().unique(),
  name: column.string(),
  age: column.number().nullable(),
  isActive: column.boolean().default(true),
  createdAt: column.timestamp().default('now()'),
  updatedAt: column.timestamp().default('now()'),
})
  .tableName('users')
  .relations({
    posts: hasMany(() => PostSchema, 'authorId'),
    profile: hasOne(() => ProfileSchema, 'userId'),
  })
  .indexes(
    { columns: ['email'], unique: true },
    { columns: ['createdAt'] },
    { columns: ['name', 'isActive'], where: 'isActive = true' }
  )
  .checks(
    { name: 'age_check', expression: 'age >= 0 AND age <= 150' }
  )
  .build();

// Define Post schema
const PostSchema = schema('Post', {
  id: column.uuid().primary().default('gen_random_uuid()'),
  title: column.string().length(255),
  content: column.text(),
  authorId: column.uuid(),
  published: column.boolean().default(false),
  publishedAt: column.timestamp().nullable(),
  viewCount: column.number().default(0),
  metadata: column.json<{ tags: string[]; category: string }>(),
  createdAt: column.timestamp().default('now()'),
})
  .tableName('posts')
  .relations({
    author: belongsTo(() => UserSchema, 'authorId'),
    tags: belongsToMany(() => TagSchema, () => PostTagSchema),
  })
  .indexes(
    { columns: ['authorId'] },
    { columns: ['published', 'publishedAt'] },
    { columns: ['title'], using: 'gin' }
  )
  .build();

// Define Profile schema
const ProfileSchema = schema('Profile', {
  id: column.uuid().primary().default('gen_random_uuid()'),
  userId: column.uuid().unique(),
  bio: column.text().nullable(),
  avatarUrl: column.string().nullable(),
  location: column.string().nullable(),
  website: column.string().nullable(),
})
  .tableName('profiles')
  .relations({
    user: belongsTo(() => UserSchema, 'userId'),
  })
  .build();

// Define Tag schema
const TagSchema = schema('Tag', {
  id: column.uuid().primary().default('gen_random_uuid()'),
  name: column.string().unique(),
  slug: column.string().unique(),
})
  .tableName('tags')
  .relations({
    posts: belongsToMany(() => PostSchema, () => PostTagSchema),
  })
  .build();

// Define junction table for many-to-many relationship
const PostTagSchema = schema('PostTag', {
  postId: column.uuid(),
  tagId: column.uuid(),
})
  .tableName('post_tags')
  .relations({
    post: belongsTo(() => PostSchema, 'postId'),
    tag: belongsTo(() => TagSchema, 'tagId'),
  })
  .indexes(
    { columns: ['postId', 'tagId'], unique: true }
  )
  .build();

// Type inference examples
type User = InferEntity<typeof UserSchema>;
type Post = InferEntity<typeof PostSchema>;
type Profile = InferEntity<typeof ProfileSchema>;

// The inferred types are fully type-safe:
const user: User = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30, // or null
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const post: Post = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  title: 'Hello World',
  content: 'This is my first post',
  authorId: user.id,
  published: true,
  publishedAt: new Date(), // or null
  viewCount: 42,
  metadata: {
    tags: ['typescript', 'orm'],
    category: 'technology',
  },
  createdAt: new Date(),
};

// Type errors are caught at compile time:
// const invalidUser: User = {
//   id: 123, // Error: Type 'number' is not assignable to type 'string'
//   email: null, // Error: Type 'null' is not assignable to type 'string'
//   name: 'John',
//   age: 'thirty', // Error: Type 'string' is not assignable to type 'number | null'
//   isActive: true,
//   createdAt: new Date(),
//   updatedAt: new Date(),
// };

// Export schemas for use in other parts of the application
export { UserSchema, PostSchema, ProfileSchema, TagSchema, PostTagSchema };

// Example of using the schema metadata
import { getPrimaryKeyFields, getUniqueFields, validateSchema } from '../src/schema/builder.js';

// Get primary key fields
console.log('User primary keys:', getPrimaryKeyFields(UserSchema)); // ['id']

// Get unique fields
console.log('User unique fields:', getUniqueFields(UserSchema)); // ['email']

// Validate schema
try {
  validateSchema(UserSchema);
  console.log('User schema is valid');
} catch (error) {
  console.error('Schema validation error:', error);
}