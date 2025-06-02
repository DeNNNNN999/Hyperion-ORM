# Hyperion ORM - Architecture & Philosophy

## Core Principles

### 1. True Type Safety Without Lies
- Types should never lie. If a relation might not be loaded, the type must reflect that
- No runtime surprises from TypeScript types
- Compile-time validation of all queries

### 2. Explicit Over Implicit
- No hidden N+1 queries through lazy loading by default
- Explicit loading strategies with type-level guarantees
- Clear transaction boundaries

### 3. Performance First
- Identity Map with WeakMap for automatic garbage collection
- Efficient change tracking through Proxy objects
- Batched operations by default
- Connection pooling built-in

### 4. Clean Architecture Support
- Pure domain entities (no ORM dependencies)
- Repository pattern with full type inference
- Unit of Work for transaction management
- No decorators pollution

## Core Components

### Schema Definition
```typescript
// No decorators, pure TypeScript
const UserSchema = defineEntity({
  name: 'users',
  columns: {
    id: { type: 'uuid', primary: true, default: 'gen_random_uuid()' },
    email: { type: 'string', unique: true },
    name: { type: 'string' },
    createdAt: { type: 'timestamp', default: 'now()' }
  },
  relations: {
    posts: hasMany(() => PostSchema, 'authorId'),
    profile: hasOne(() => ProfileSchema, 'userId')
  },
  indexes: [
    { columns: ['email'], unique: true },
    { columns: ['createdAt'] }
  ]
});
```

### Entity Manager (Data Mapper Pattern)
```typescript
const em = new EntityManager(connection);

// Type-safe queries with explicit loading
const users = await em.find(UserSchema, {
  where: { email: { like: '%@example.com' } },
  include: { posts: true }, // Type knows posts are loaded
  orderBy: { createdAt: 'desc' },
  limit: 10
});

// users type: Array<User & { posts: Post[] }>
```

### Unit of Work
```typescript
const uow = em.createUnitOfWork();

const user = await uow.findOne(UserSchema, { id: userId });
user.name = 'New Name'; // Tracked automatically

const newPost = uow.create(PostSchema, {
  title: 'Hello',
  authorId: user.id
});

// Single transaction, optimized queries
await uow.commit();
```

### Identity Map
```typescript
const user1 = await em.findOne(UserSchema, { id: 1 });
const user2 = await em.findOne(UserSchema, { id: 1 });

console.log(user1 === user2); // true - same instance
```

### Query Builder (When Needed)
```typescript
const results = await em
  .createQueryBuilder(UserSchema, 'u')
  .leftJoin('u.posts', 'p')
  .where('p.publishedAt > :date', { date: lastWeek })
  .groupBy('u.id')
  .having('COUNT(p.id) > :count', { count: 5 })
  .select(['u.id', 'u.name', 'COUNT(p.id) as postCount'])
  .getRawMany();

// Full type inference even for raw queries
```

## Implementation Strategy

1. **Phase 1**: Core abstractions (Entity Manager, Schema, Types)
2. **Phase 2**: Identity Map + Unit of Work
3. **Phase 3**: Query Builder with type inference
4. **Phase 4**: Migrations and CLI
5. **Phase 5**: Advanced features (caching, sharding support)

## Why Another ORM?

We're not building "another ORM" - we're building the ORM that TypeScript deserves:
- Prisma's type safety without the generation step
- MikroORM's patterns without the complexity
- Drizzle's SQL closeness with proper ORM patterns
- TypeORM's features without the broken types

This is Hyperion - the Titan of type-safe data access.