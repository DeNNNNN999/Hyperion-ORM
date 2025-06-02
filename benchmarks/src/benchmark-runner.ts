/**
 * Comprehensive benchmark runner for ORM comparison
 */

import Benchmark from 'benchmark';
import chalk from 'chalk';
import Table from 'cli-table3';
import { performance } from 'perf_hooks';

export interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  rme: number; // Relative margin of error
  samples: number;
  fastest: boolean;
  slowest: boolean;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  customMetrics?: Record<string, number>;
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  results: BenchmarkResult[];
  winner: string;
  summary: string;
}

export class BenchmarkRunner {
  private suites: BenchmarkSuite[] = [];
  
  async runBenchmarkSuite(
    suiteName: string,
    description: string,
    tests: Array<{
      name: string;
      fn: () => Promise<void> | void;
      setup?: () => Promise<void> | void;
      teardown?: () => Promise<void> | void;
    }>
  ): Promise<BenchmarkSuite> {
    console.log(chalk.blue(`\n🚀 Running ${suiteName}: ${description}`));
    console.log(chalk.gray('─'.repeat(60)));

    const suite = new Benchmark.Suite();
    const results: BenchmarkResult[] = [];
    
    // Setup phase
    for (const test of tests) {
      if (test.setup) {
        console.log(chalk.yellow(`Setting up ${test.name}...`));
        await test.setup();
      }
    }

    // Add tests to suite
    for (const test of tests) {
      suite.add(test.name, {
        defer: true,
        fn: async (deferred: any) => {
          try {
            const startMem = process.memoryUsage();
            const startTime = performance.now();
            
            await test.fn();
            
            const endTime = performance.now();
            const endMem = process.memoryUsage();
            
            // Store custom metrics
            (deferred as any).customMetrics = {
              executionTime: endTime - startTime,
              memoryDelta: endMem.heapUsed - startMem.heapUsed
            };
            
            deferred.resolve();
          } catch (error) {
            console.error(chalk.red(`Error in ${test.name}:`), error);
            deferred.resolve(); // Continue with other tests
          }
        }
      });
    }

    // Run benchmarks
    return new Promise((resolve) => {
      suite
        .on('cycle', (event: any) => {
          const benchmark = event.target;
          const memUsage = process.memoryUsage();
          
          const result: BenchmarkResult = {
            name: benchmark.name,
            opsPerSecond: benchmark.hz,
            rme: benchmark.stats.rme,
            samples: benchmark.stats.sample.length,
            fastest: false,
            slowest: false,
            memoryUsage: {
              heapUsed: memUsage.heapUsed,
              heapTotal: memUsage.heapTotal,
              external: memUsage.external,
              rss: memUsage.rss,
            },
            customMetrics: benchmark.customMetrics
          };
          
          results.push(result);
          
          console.log(chalk.cyan(`  ${benchmark.name}: ${this.formatOpsPerSecond(benchmark.hz)} ops/sec ±${benchmark.stats.rme.toFixed(2)}%`));
        })
        .on('complete', async () => {
          // Mark fastest/slowest
          if (results.length > 1) {
            const sorted = [...results].sort((a, b) => b.opsPerSecond - a.opsPerSecond);
            sorted[0].fastest = true;
            sorted[sorted.length - 1].slowest = true;
          }

          const winner = results.find(r => r.fastest)?.name || 'Unknown';
          
          console.log(chalk.green(`\n🏆 Fastest: ${winner}`));
          
          // Teardown phase
          for (const test of tests) {
            if (test.teardown) {
              console.log(chalk.yellow(`Cleaning up ${test.name}...`));
              try {
                await test.teardown();
              } catch (error) {
                console.error(chalk.red(`Teardown error for ${test.name}:`), error);
              }
            }
          }

          const benchmarkSuite: BenchmarkSuite = {
            name: suiteName,
            description,
            results,
            winner,
            summary: this.generateSummary(results)
          };

          this.suites.push(benchmarkSuite);
          resolve(benchmarkSuite);
        })
        .run({ async: true });
    });
  }

  async runMemoryBenchmark(
    testName: string,
    fn: () => Promise<void> | void,
    iterations: number = 100
  ): Promise<{
    avgMemoryUsage: number;
    peakMemoryUsage: number;
    memoryGrowth: number;
    iterations: number;
  }> {
    const memorySnapshots: number[] = [];
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    for (let i = 0; i < iterations; i++) {
      await fn();
      
      // Take memory snapshot every 10 iterations
      if (i % 10 === 0) {
        if (global.gc) global.gc(); // Force GC to get accurate reading
        memorySnapshots.push(process.memoryUsage().heapUsed);
      }
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const avgMemoryUsage = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
    const peakMemoryUsage = Math.max(...memorySnapshots);
    const memoryGrowth = finalMemory - initialMemory;

    return {
      avgMemoryUsage,
      peakMemoryUsage,
      memoryGrowth,
      iterations
    };
  }

  generateReport(): string {
    let report = chalk.bold.blue('\n📊 ORM BENCHMARK REPORT\n');
    report += chalk.blue('═'.repeat(60)) + '\n';

    for (const suite of this.suites) {
      report += chalk.bold.yellow(`\n🔍 ${suite.name}: ${suite.description}\n`);
      report += chalk.yellow('─'.repeat(40)) + '\n';

      // Create table for results
      const table = new Table({
        head: ['ORM', 'Ops/sec', 'RME', 'Samples', 'Status'],
        colWidths: [15, 12, 8, 10, 15]
      });

      const sortedResults = [...suite.results].sort((a, b) => b.opsPerSecond - a.opsPerSecond);
      
      for (const result of sortedResults) {
        const status = result.fastest ? chalk.green('🏆 Fastest') : 
                      result.slowest ? chalk.red('🐌 Slowest') : '';
        
        table.push([
          result.name,
          this.formatOpsPerSecond(result.opsPerSecond),
          `${result.rme.toFixed(2)}%`,
          result.samples.toString(),
          status
        ]);
      }

      report += table.toString() + '\n';
      report += chalk.gray(`Winner: ${suite.winner}\n`);
    }

    // Overall analysis
    report += chalk.bold.green('\n📈 OVERALL ANALYSIS\n');
    report += chalk.green('═'.repeat(40)) + '\n';

    const ormStats = this.calculateOrmStats();
    for (const [orm, stats] of Object.entries(ormStats)) {
      report += chalk.cyan(`${orm}: ${stats.wins} wins, ${stats.participations} tests\n`);
    }

    return report;
  }

  private calculateOrmStats(): Record<string, { wins: number; participations: number }> {
    const stats: Record<string, { wins: number; participations: number }> = {};

    for (const suite of this.suites) {
      for (const result of suite.results) {
        if (!stats[result.name]) {
          stats[result.name] = { wins: 0, participations: 0 };
        }
        stats[result.name].participations++;
        if (result.fastest) {
          stats[result.name].wins++;
        }
      }
    }

    return stats;
  }

  private formatOpsPerSecond(ops: number): string {
    if (ops >= 1000000) {
      return `${(ops / 1000000).toFixed(2)}M`;
    } else if (ops >= 1000) {
      return `${(ops / 1000).toFixed(2)}K`;
    }
    return ops.toFixed(2);
  }

  private generateSummary(results: BenchmarkResult[]): string {
    const fastest = results.find(r => r.fastest);
    const slowest = results.find(r => r.slowest);
    
    if (!fastest || !slowest) return 'Insufficient data for summary';
    
    const speedDifference = ((fastest.opsPerSecond - slowest.opsPerSecond) / slowest.opsPerSecond * 100).toFixed(1);
    
    return `${fastest.name} was ${speedDifference}% faster than ${slowest.name}`;
  }

  getSuites(): BenchmarkSuite[] {
    return this.suites;
  }

  clear(): void {
    this.suites = [];
  }
}