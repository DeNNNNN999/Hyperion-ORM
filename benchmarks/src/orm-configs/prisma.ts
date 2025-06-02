/**
 * Prisma ORM configuration for benchmarks
 */

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:password@localhost:5432/orm_benchmark'
    }
  }
});

export const prismaORM = {
  name: 'Prisma',
  
  // Simple queries
  async findUserById(id: number) {
    return prisma.users.findUnique({
      where: { id }
    });
  },

  async findUserByEmail(email: string) {
    return prisma.users.findUnique({
      where: { email }
    });
  },

  async findActiveUsers() {
    return prisma.users.findMany({
      where: { isActive: true }
    });
  },

  // Complex queries with joins
  async findUserWithPosts(userId: number) {
    return prisma.users.findUnique({
      where: { id: userId },
      include: {
        posts: true
      }
    });
  },

  async findPostsWithCommentsAndUsers() {
    return prisma.posts.findMany({
      where: { published: true },
      take: 1000,
      include: {
        user: true,
        comments: {
          include: {
            user: true
          }
        }
      }
    });
  },

  // Batch operations
  async insertUsers(users: any[]) {
    return prisma.users.createMany({
      data: users.map(u => ({
        email: u.email,
        name: u.name,
        age: u.age,
        isActive: u.isActive
      }))
    });
  },

  async updateUsersBatch(updates: { id: number; name: string }[]) {
    const promises = updates.map(update => 
      prisma.users.update({
        where: { id: update.id },
        data: { name: update.name }
      })
    );
    return Promise.all(promises);
  },

  // Memory efficiency tests
  async loadLargeDataset() {
    return prisma.posts.findMany({
      where: { published: true },
      take: 10000
    });
  },

  async loadWithIdentityMap() {
    // Prisma doesn't have explicit Identity Map, but has query caching
    const results = [];
    
    // Load same users multiple times
    for (let i = 1; i <= 100; i++) {
      const user = await prisma.users.findUnique({
        where: { id: i }
      });
      if (user) results.push(user);
    }
    
    // Load same users again
    for (let i = 1; i <= 100; i++) {
      const user = await prisma.users.findUnique({
        where: { id: i }
      });
      if (user) results.push(user);
    }
    
    return results;
  },

  // Transaction tests
  async complexTransactionTest() {
    return prisma.$transaction(async (tx) => {
      // Create new user
      const newUser = await tx.users.create({
        data: {
          email: `benchmark${Date.now()}@example.com`,
          name: 'Benchmark User',
          age: 25
        }
      });

      // Update existing user
      const updatedUser = await tx.users.update({
        where: { id: 1 },
        data: { name: 'Updated Name' }
      });

      return { newUser, updatedUser };
    });
  },

  async cleanup() {
    await prisma.$disconnect();
  }
};