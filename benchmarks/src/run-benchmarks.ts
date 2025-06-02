/**
 * Main benchmark execution script
 * Comprehensive comparison of Hyperion ORM vs competitors
 */

import chalk from 'chalk';
import { BenchmarkRunner } from './benchmark-runner.js';
import { hyperionORM } from './orm-configs/hyperion.js';
import { prismaORM } from './orm-configs/prisma.js';
import { drizzleORM } from './orm-configs/drizzle.js';
import { typeORM } from './orm-configs/typeorm.js';
import { mikroORM } from './orm-configs/mikro-orm.js';
import { setupDatabase } from './setup-database.js';

const runner = new BenchmarkRunner();

async function runAllBenchmarks() {
  console.log(chalk.bold.blue('🚀 HYPERION ORM COMPREHENSIVE BENCHMARKS'));
  console.log(chalk.blue('═'.repeat(60)));
  console.log(chalk.cyan('Comparing Hyperion ORM with Prisma, Drizzle, TypeORM, and MikroORM\n'));

  try {
    // Setup database
    console.log(chalk.yellow('🔧 Setting up test database...'));
    await setupDatabase();
    
    // Initialize ORMs
    console.log(chalk.yellow('🔌 Initializing ORMs...'));
    await typeORM.initialize();
    await mikroORM.initialize();

    // 1. Simple Query Benchmarks
    await runner.runBenchmarkSuite(
      'Simple Queries',
      'Basic CRUD operations and simple selects',
      [
        {
          name: 'Hyperion ORM',
          fn: async () => {
            await hyperionORM.findUserById(1);
            await hyperionORM.findUserByEmail('user1@example.com');
          }
        },
        {
          name: 'Prisma',
          fn: async () => {
            await prismaORM.findUserById(1);
            await prismaORM.findUserByEmail('user1@example.com');
          }
        },
        {
          name: 'Drizzle',
          fn: async () => {
            await drizzleORM.findUserById(1);
            await drizzleORM.findUserByEmail('user1@example.com');
          }
        },
        {
          name: 'TypeORM',
          fn: async () => {
            await typeORM.findUserById(1);
            await typeORM.findUserByEmail('user1@example.com');
          }
        },
        {
          name: 'MikroORM',
          fn: async () => {
            await mikroORM.findUserById(1);
            await mikroORM.findUserByEmail('user1@example.com');
          }
        }
      ]
    );

    // 2. Complex Query Benchmarks
    await runner.runBenchmarkSuite(
      'Complex Queries',
      'Queries with joins and relations',
      [
        {
          name: 'Hyperion ORM',
          fn: async () => {
            await hyperionORM.findUserWithPosts(1);
          }
        },
        {
          name: 'Prisma',
          fn: async () => {
            await prismaORM.findUserWithPosts(1);
          }
        },
        {
          name: 'Drizzle',
          fn: async () => {
            await drizzleORM.findUserWithPosts(1);
          }
        },
        {
          name: 'TypeORM',
          fn: async () => {
            await typeORM.findUserWithPosts(1);
          }
        },
        {
          name: 'MikroORM',
          fn: async () => {
            await mikroORM.findUserWithPosts(1);
          }
        }
      ]
    );

    // 3. Batch Operations
    await runner.runBenchmarkSuite(
      'Batch Operations',
      'Insert and update multiple records',
      [
        {
          name: 'Hyperion ORM',
          fn: async () => {
            const users = Array.from({ length: 100 }, (_, i) => ({
              email: `batch_hyperion_${i}_${Date.now()}@example.com`,
              name: `Batch User ${i}`,
              age: 20 + (i % 50),
              isActive: true
            }));
            await hyperionORM.insertUsers(users);
          }
        },
        {
          name: 'Prisma',
          fn: async () => {
            const users = Array.from({ length: 100 }, (_, i) => ({
              email: `batch_prisma_${i}_${Date.now()}@example.com`,
              name: `Batch User ${i}`,
              age: 20 + (i % 50),
              isActive: true
            }));
            await prismaORM.insertUsers(users);
          }
        },
        {
          name: 'Drizzle',
          fn: async () => {
            const users = Array.from({ length: 100 }, (_, i) => ({
              email: `batch_drizzle_${i}_${Date.now()}@example.com`,
              name: `Batch User ${i}`,
              age: 20 + (i % 50),
              isActive: true
            }));
            await drizzleORM.insertUsers(users);
          }
        },
        {
          name: 'TypeORM',
          fn: async () => {
            const users = Array.from({ length: 100 }, (_, i) => ({
              email: `batch_typeorm_${i}_${Date.now()}@example.com`,
              name: `Batch User ${i}`,
              age: 20 + (i % 50),
              isActive: true
            }));
            await typeORM.insertUsers(users);
          }
        },
        {
          name: 'MikroORM',
          fn: async () => {
            const users = Array.from({ length: 100 }, (_, i) => ({
              email: `batch_mikro_${i}_${Date.now()}@example.com`,
              name: `Batch User ${i}`,
              age: 20 + (i % 50),
              isActive: true
            }));
            await mikroORM.insertUsers(users);
          }
        }
      ]
    );

    // 4. Memory Efficiency Tests
    console.log(chalk.blue('\n🧠 Memory Efficiency Tests'));
    console.log(chalk.blue('─'.repeat(40)));

    const memoryResults = [];

    // Test Hyperion's Identity Map
    console.log(chalk.yellow('Testing Hyperion Identity Map efficiency...'));
    const hyperionMemory = await runner.runMemoryBenchmark(
      () => hyperionORM.loadWithIdentityMap(),
      50
    );
    memoryResults.push({ name: 'Hyperion ORM (Identity Map)', ...hyperionMemory });

    // Test TypeORM Identity Map
    console.log(chalk.yellow('Testing TypeORM Identity Map efficiency...'));
    const typeormMemory = await runner.runMemoryBenchmark(
      () => typeORM.loadWithIdentityMap(),
      50
    );
    memoryResults.push({ name: 'TypeORM (Identity Map)', ...typeormMemory });

    // Test MikroORM Identity Map
    console.log(chalk.yellow('Testing MikroORM Identity Map efficiency...'));
    const mikroMemory = await runner.runMemoryBenchmark(
      () => mikroORM.loadWithIdentityMap(),
      50
    );
    memoryResults.push({ name: 'MikroORM (Identity Map)', ...mikroMemory });

    // Test Prisma (no Identity Map)
    console.log(chalk.yellow('Testing Prisma memory usage...'));
    const prismaMemory = await runner.runMemoryBenchmark(
      () => prismaORM.loadWithIdentityMap(),
      50
    );
    memoryResults.push({ name: 'Prisma (no Identity Map)', ...prismaMemory });

    // Test Drizzle (no Identity Map)
    console.log(chalk.yellow('Testing Drizzle memory usage...'));
    const drizzleMemory = await runner.runMemoryBenchmark(
      () => drizzleORM.loadWithIdentityMap(),
      50
    );
    memoryResults.push({ name: 'Drizzle (no Identity Map)', ...drizzleMemory });

    // Display memory results
    console.log(chalk.cyan('\\n📊 Memory Usage Results:'));
    for (const result of memoryResults) {
      console.log(chalk.cyan(`${result.name}:`));
      console.log(chalk.gray(`  Average Memory: ${(result.avgMemoryUsage / 1024 / 1024).toFixed(2)} MB`));
      console.log(chalk.gray(`  Peak Memory: ${(result.peakMemoryUsage / 1024 / 1024).toFixed(2)} MB`));
      console.log(chalk.gray(`  Memory Growth: ${(result.memoryGrowth / 1024 / 1024).toFixed(2)} MB`));
    }

    // 5. Transaction Performance
    await runner.runBenchmarkSuite(
      'Transaction Performance',
      'Complex transaction operations',
      [
        {
          name: 'Hyperion ORM',
          fn: async () => {
            await hyperionORM.complexTransactionTest();
          }
        },
        {
          name: 'Prisma',
          fn: async () => {
            await prismaORM.complexTransactionTest();
          }
        },
        {
          name: 'Drizzle',
          fn: async () => {
            await drizzleORM.complexTransactionTest();
          }
        },
        {
          name: 'TypeORM',
          fn: async () => {
            await typeORM.complexTransactionTest();
          }
        },
        {
          name: 'MikroORM',
          fn: async () => {
            await mikroORM.complexTransactionTest();
          }
        }
      ]
    );

    // 6. Large Dataset Performance
    await runner.runBenchmarkSuite(
      'Large Dataset Handling',
      'Loading and processing large amounts of data',
      [
        {
          name: 'Hyperion ORM',
          fn: async () => {
            await hyperionORM.loadLargeDataset();
          }
        },
        {
          name: 'Prisma',
          fn: async () => {
            await prismaORM.loadLargeDataset();
          }
        },
        {
          name: 'Drizzle',
          fn: async () => {
            await drizzleORM.loadLargeDataset();
          }
        },
        {
          name: 'TypeORM',
          fn: async () => {
            await typeORM.loadLargeDataset();
          }
        },
        {
          name: 'MikroORM',
          fn: async () => {
            await mikroORM.loadLargeDataset();
          }
        }
      ]
    );

    // Generate final report
    const report = runner.generateReport();
    console.log(report);

    // Save report to file
    const fs = await import('fs/promises');
    const reportPath = `./benchmark-report-${new Date().toISOString().split('T')[0]}.md`;
    await fs.writeFile(reportPath, report.replace(/\x1b\[[0-9;]*m/g, ''));
    console.log(chalk.green(`\n📄 Report saved to: ${reportPath}`));

  } catch (error) {
    console.error(chalk.red('❌ Benchmark failed:'), error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log(chalk.yellow('\\n🧹 Cleaning up...'));
    try {
      await hyperionORM.cleanup();
      await prismaORM.cleanup();
      await drizzleORM.cleanup();
      await typeORM.cleanup();
      await mikroORM.cleanup();
    } catch (error) {
      console.error(chalk.red('Cleanup error:'), error);
    }
  }
}

// Feature comparison matrix
function generateFeatureComparison() {
  console.log(chalk.bold.blue('\\n🔍 FEATURE COMPARISON MATRIX'));
  console.log(chalk.blue('═'.repeat(60)));

  const features = [
    ['Feature', 'Hyperion', 'Prisma', 'Drizzle', 'TypeORM', 'MikroORM'],
    ['Identity Map', '✅ Built-in', '❌ No', '❌ No', '✅ Built-in', '✅ Built-in'],
    ['Change Tracking', '✅ Auto Proxy', '❌ No', '❌ No', '✅ Manual', '✅ Built-in'],
    ['Unit of Work', '✅ Advanced', '❌ No', '❌ No', '✅ Basic', '✅ Built-in'],
    ['Type Safety', '✅ Full', '✅ Full', '✅ Full', '✅ Decorators', '✅ Decorators'],
    ['Query Builder', '✅ Fluent', '✅ Fluent', '✅ SQL-like', '✅ Object', '✅ Object'],
    ['Migrations', '✅ Advanced', '✅ Basic', '✅ Basic', '✅ Advanced', '✅ Advanced'],
    ['Connection Pool', '✅ Advanced', '✅ Basic', '❌ Manual', '✅ Basic', '✅ Basic'],
    ['Transactions', '✅ Nested+SP', '✅ Basic', '✅ Basic', '✅ Advanced', '✅ Advanced'],
    ['Performance', '🚀 High', '⚡ Good', '🚀 High', '📊 Medium', '📊 Medium'],
    ['Bundle Size', '📦 Small', '📦 Large', '📦 Small', '📦 Large', '📦 Large'],
    ['Learning Curve', '📚 Medium', '📚 Easy', '📚 Medium', '📚 Hard', '📚 Hard']
  ];

  const Table = (await import('cli-table3')).default;
  const table = new Table({
    head: features[0],
    colWidths: [20, 15, 15, 15, 15, 15]
  });

  for (let i = 1; i < features.length; i++) {
    table.push(features[i]);
  }

  console.log(table.toString());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllBenchmarks()
    .then(() => generateFeatureComparison())
    .then(() => {
      console.log(chalk.bold.green('\\n🎉 Benchmark completed successfully!'));
      process.exit(0);
    })
    .catch((error) => {
      console.error(chalk.red('❌ Benchmark failed:'), error);
      process.exit(1);
    });
}