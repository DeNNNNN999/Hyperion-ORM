/**
 * MikroORM configuration for benchmarks
 */

import { MikroORM, Entity, PrimaryKey, Property, OneToMany, ManyToOne, Collection } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ length: 255, unique: true })
  email!: string;

  @Property({ length: 255 })
  name!: string;

  @Property({ nullable: true })
  age?: number;

  @Property({ fieldName: 'is_active', default: true })
  isActive!: boolean;

  @Property({ fieldName: 'created_at', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt!: Date;

  @OneToMany(() => Post, post => post.user)
  posts = new Collection<Post>(this);

  @OneToMany(() => Comment, comment => comment.user)
  comments = new Collection<Comment>(this);
}

@Entity({ tableName: 'posts' })
export class Post {
  @PrimaryKey()
  id!: number;

  @Property({ length: 255 })
  title!: string;

  @Property({ type: 'text', nullable: true })
  content?: string;

  @Property({ fieldName: 'user_id' })
  userId!: number;

  @Property({ default: 0 })
  views!: number;

  @Property({ default: false })
  published!: boolean;

  @Property({ fieldName: 'created_at', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt!: Date;

  @ManyToOne(() => User)
  user!: User;

  @OneToMany(() => Comment, comment => comment.post)
  comments = new Collection<Comment>(this);
}

@Entity({ tableName: 'comments' })
export class Comment {
  @PrimaryKey()
  id!: number;

  @Property({ type: 'text' })
  content!: string;

  @Property({ fieldName: 'post_id' })
  postId!: number;

  @Property({ fieldName: 'user_id' })
  userId!: number;

  @Property({ fieldName: 'created_at', onCreate: () => new Date() })
  createdAt!: Date;

  @ManyToOne(() => Post)
  post!: Post;

  @ManyToOne(() => User)
  user!: User;
}

@Entity({ tableName: 'categories' })
export class Category {
  @PrimaryKey()
  id!: number;

  @Property({ length: 255 })
  name!: string;

  @Property({ type: 'text', nullable: true })
  description?: string;
}

let orm: MikroORM<PostgreSqlDriver>;

export const mikroORM = {
  name: 'MikroORM',
  
  async initialize() {
    if (!orm) {
      orm = await MikroORM.init<PostgreSqlDriver>({
        driver: PostgreSqlDriver,
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        dbName: 'orm_benchmark',
        entities: [User, Post, Comment, Category],
        debug: false,
      });
    }
  },

  // Simple queries
  async findUserById(id: number) {
    await this.initialize();
    return orm.em.findOne(User, { id });
  },

  async findUserByEmail(email: string) {
    await this.initialize();
    return orm.em.findOne(User, { email });
  },

  async findActiveUsers() {
    await this.initialize();
    return orm.em.find(User, { isActive: true });
  },

  // Complex queries with joins
  async findUserWithPosts(userId: number) {
    await this.initialize();
    return orm.em.findOne(User, { id: userId }, { populate: ['posts'] });
  },

  async findPostsWithCommentsAndUsers() {
    await this.initialize();
    return orm.em.find(Post, 
      { published: true }, 
      { 
        populate: ['user', 'comments', 'comments.user'],
        limit: 1000 
      }
    );
  },

  // Batch operations
  async insertUsers(users: any[]) {
    await this.initialize();
    const em = orm.em.fork();
    
    users.forEach(userData => {
      const user = em.create(User, {
        email: userData.email,
        name: userData.name,
        age: userData.age,
        isActive: userData.isActive
      });
      em.persist(user);
    });
    
    await em.flush();
    return users.length;
  },

  async updateUsersBatch(updates: { id: number; name: string }[]) {
    await this.initialize();
    const em = orm.em.fork();
    
    const users = await em.find(User, { id: { $in: updates.map(u => u.id) } });
    
    users.forEach(user => {
      const update = updates.find(u => u.id === user.id);
      if (update) {
        user.name = update.name;
      }
    });
    
    await em.flush();
    return users;
  },

  // Memory efficiency tests
  async loadLargeDataset() {
    await this.initialize();
    return orm.em.find(Post, { published: true }, { limit: 10000 });
  },

  async loadWithIdentityMap() {
    await this.initialize();
    const em = orm.em.fork();
    const results = [];
    
    // MikroORM has Identity Map built-in
    // Load same users multiple times - should use Identity Map
    for (let i = 1; i <= 100; i++) {
      const user = await em.findOne(User, { id: i });
      if (user) results.push(user);
    }
    
    // Load same users again - should come from Identity Map
    for (let i = 1; i <= 100; i++) {
      const user = await em.findOne(User, { id: i });
      if (user) results.push(user);
    }
    
    return results;
  },

  // Transaction tests
  async complexTransactionTest() {
    await this.initialize();
    const em = orm.em.fork();
    
    return em.transactional(async em => {
      // Create new user
      const newUser = em.create(User, {
        email: `benchmark${Date.now()}@example.com`,
        name: 'Benchmark User',
        age: 25
      });
      em.persist(newUser);

      // Update existing user
      const existingUser = await em.findOne(User, { id: 1 });
      if (existingUser) {
        existingUser.name = 'Updated Name';
      }

      await em.flush();
      return { newUser, updatedUser: existingUser };
    });
  },

  async cleanup() {
    if (orm) {
      await orm.close();
    }
  }
};