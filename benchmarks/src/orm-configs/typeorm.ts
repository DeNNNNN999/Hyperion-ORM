/**
 * TypeORM configuration for benchmarks
 */

import { DataSource, Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255, unique: true })
  email!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ nullable: true })
  age?: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Post, post => post.user)
  posts!: Post[];

  @OneToMany(() => Comment, comment => comment.user)
  comments!: Comment[];
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  title!: string;

  @Column('text', { nullable: true })
  content?: string;

  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ default: 0 })
  views!: number;

  @Column({ default: false })
  published!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, user => user.posts)
  user!: User;

  @OneToMany(() => Comment, comment => comment.post)
  comments!: Comment[];
}

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('text')
  content!: string;

  @Column({ name: 'post_id' })
  postId!: number;

  @Column({ name: 'user_id' })
  userId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Post, post => post.comments)
  post!: Post;

  @ManyToOne(() => User, user => user.comments)
  user!: User;
}

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  name!: string;

  @Column('text', { nullable: true })
  description?: string;
}

export const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'orm_benchmark',
  entities: [User, Post, Comment, Category],
  synchronize: false,
  logging: false,
});

export const typeORM = {
  name: 'TypeORM',
  
  async initialize() {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
  },

  // Simple queries
  async findUserById(id: number) {
    await this.initialize();
    return dataSource.getRepository(User).findOne({ where: { id } });
  },

  async findUserByEmail(email: string) {
    await this.initialize();
    return dataSource.getRepository(User).findOne({ where: { email } });
  },

  async findActiveUsers() {
    await this.initialize();
    return dataSource.getRepository(User).find({ where: { isActive: true } });
  },

  // Complex queries with joins
  async findUserWithPosts(userId: number) {
    await this.initialize();
    return dataSource.getRepository(User).findOne({
      where: { id: userId },
      relations: ['posts']
    });
  },

  async findPostsWithCommentsAndUsers() {
    await this.initialize();
    return dataSource.getRepository(Post).find({
      where: { published: true },
      relations: ['user', 'comments', 'comments.user'],
      take: 1000
    });
  },

  // Batch operations
  async insertUsers(users: any[]) {
    await this.initialize();
    const userEntities = users.map(u => {
      const user = new User();
      user.email = u.email;
      user.name = u.name;
      user.age = u.age;
      user.isActive = u.isActive;
      return user;
    });
    return dataSource.getRepository(User).save(userEntities);
  },

  async updateUsersBatch(updates: { id: number; name: string }[]) {
    await this.initialize();
    const promises = updates.map(update => 
      dataSource.getRepository(User).update(update.id, { name: update.name })
    );
    return Promise.all(promises);
  },

  // Memory efficiency tests
  async loadLargeDataset() {
    await this.initialize();
    return dataSource.getRepository(Post).find({
      where: { published: true },
      take: 10000
    });
  },

  async loadWithIdentityMap() {
    await this.initialize();
    const results = [];
    
    // TypeORM has Identity Map built-in within same EntityManager
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
      // Load same users multiple times - should use Identity Map
      for (let i = 1; i <= 100; i++) {
        const user = await queryRunner.manager.findOne(User, { where: { id: i } });
        if (user) results.push(user);
      }
      
      // Load same users again - should come from Identity Map
      for (let i = 1; i <= 100; i++) {
        const user = await queryRunner.manager.findOne(User, { where: { id: i } });
        if (user) results.push(user);
      }
    } finally {
      await queryRunner.release();
    }
    
    return results;
  },

  // Transaction tests
  async complexTransactionTest() {
    await this.initialize();
    return dataSource.transaction(async manager => {
      // Create new user
      const newUser = new User();
      newUser.email = `benchmark${Date.now()}@example.com`;
      newUser.name = 'Benchmark User';
      newUser.age = 25;
      
      const savedUser = await manager.save(newUser);

      // Update existing user
      await manager.update(User, 1, { name: 'Updated Name' });
      const updatedUser = await manager.findOne(User, { where: { id: 1 } });

      return { newUser: savedUser, updatedUser };
    });
  },

  async cleanup() {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
};