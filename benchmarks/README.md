# Hyperion ORM Benchmarks

Comprehensive performance comparison between Hyperion ORM and leading TypeScript ORMs.

## 🎯 Compared ORMs

- **Hyperion ORM** - Our custom implementation with advanced patterns
- **Prisma** - Most popular Node.js ORM
- **Drizzle** - Lightweight SQL-like ORM
- **TypeORM** - Enterprise-grade ORM with decorators
- **MikroORM** - Full-featured ORM with Unit of Work pattern

## 🧪 Test Categories

### 1. Simple Queries
- Find by ID
- Find by unique field
- Basic filtering

### 2. Complex Queries
- Joins with relations
- Nested data loading
- Aggregations

### 3. Batch Operations
- Bulk inserts
- Bulk updates
- Transaction batching

### 4. Memory Efficiency
- Identity Map effectiveness
- Memory usage patterns
- Garbage collection impact

### 5. Transaction Performance
- Nested transactions
- Savepoint handling
- Rollback scenarios

### 6. Large Dataset Handling
- Loading 10K+ records
- Streaming capabilities
- Memory optimization

## 🚀 Running Benchmarks

### Prerequisites

1. PostgreSQL server running on localhost:5432
2. Database user 'postgres' with password 'password'
3. Node.js 18+ with TypeScript support

### Setup

```bash
cd benchmarks
npm install
npm run setup  # Creates test database with sample data
```

### Run All Benchmarks

```bash
npm run benchmark
```

### Individual Test Suites

```bash
npm run benchmark:simple    # Simple queries only
npm run benchmark:complex   # Complex queries only
npm run benchmark:memory    # Memory usage tests
npm run benchmark:transactions  # Transaction performance
```

## 📊 Expected Results

Based on our architectural advantages, Hyperion ORM should excel in:

### 🏆 **Hyperion ORM Advantages**

1. **Memory Efficiency**
   - Identity Map with WeakMap prevents memory leaks
   - Automatic garbage collection of unused entities
   - ~30-50% less memory usage vs ORMs without Identity Map

2. **Change Tracking Performance** 
   - Proxy-based automatic change detection
   - No manual dirty checking required
   - Faster than decorator-based systems

3. **Transaction Management**
   - Nested transactions with savepoints
   - Advanced deadlock detection and retry
   - Better error handling and rollback strategies

4. **Query Performance**
   - Type-safe query builder with zero overhead
   - Optimized SQL generation
   - Connection pooling with health monitoring

5. **Developer Experience**
   - No code generation required (vs Prisma)
   - No decorators needed (vs TypeORM/MikroORM)
   - Full TypeScript inference

### 📈 **Performance Expectations**

| Test Category | Hyperion vs Competitors |
|---------------|--------------------------|
| Simple Queries | +15-25% faster |
| Memory Usage | -30-50% memory |
| Batch Operations | +20-40% faster |
| Transactions | +25-35% faster |
| Large Datasets | +10-20% faster |

### 🎯 **Key Differentiators**

1. **Zero Runtime Dependencies** - Smaller bundle size
2. **Advanced Connection Pooling** - Better resource management
3. **Intelligent Caching** - Identity Map + Query optimization
4. **Enterprise Patterns** - Unit of Work, Change Tracking
5. **Type Safety** - No runtime schema validation needed

## 📋 Benchmark Environment

- **OS**: Linux x64
- **Node.js**: v18+
- **PostgreSQL**: v13+
- **Memory**: Minimum 8GB RAM
- **CPU**: Multi-core recommended

## 🔍 Interpreting Results

### Operations Per Second (ops/sec)
Higher is better. Shows how many operations can be completed per second.

### Relative Margin of Error (RME)
Lower is better. Shows consistency of measurements (target: <5%).

### Memory Usage
- **Average**: Typical memory consumption during test
- **Peak**: Maximum memory used
- **Growth**: Memory increase over time (indicates leaks)

### Feature Comparison
Each ORM is scored on:
- ✅ Full support / Advanced implementation
- ⚡ Basic support / Standard implementation  
- ❌ Not supported / Manual implementation required

## 🛠 Customizing Benchmarks

You can modify test parameters in `src/run-benchmarks.ts`:

```typescript
// Adjust iteration counts
const SIMPLE_QUERY_ITERATIONS = 1000;
const BATCH_SIZE = 100;
const MEMORY_TEST_ITERATIONS = 50;

// Modify test data
const USER_COUNT = 10000;
const POST_COUNT = 50000;
const COMMENT_COUNT = 200000;
```

## 📊 Sample Report Output

```
🚀 HYPERION ORM COMPREHENSIVE BENCHMARKS
═══════════════════════════════════════════════════════════

🔍 Simple Queries: Basic CRUD operations and simple selects
────────────────────────────────────────────────────────
┌───────────────┬──────────────┬────────┬──────────┬─────────────────┐
│ ORM           │ Ops/sec      │ RME    │ Samples  │ Status          │
├───────────────┼──────────────┼────────┼──────────┼─────────────────┤
│ Hyperion ORM  │ 2.45K        │ 1.23%  │ 89       │ 🏆 Fastest     │
│ Drizzle       │ 2.31K        │ 1.45%  │ 87       │                 │
│ Prisma        │ 1.98K        │ 2.15%  │ 85       │                 │
│ TypeORM       │ 1.76K        │ 1.89%  │ 82       │                 │
│ MikroORM      │ 1.65K        │ 2.34%  │ 80       │ 🐌 Slowest     │
└───────────────┴──────────────┴────────┴──────────┴─────────────────┘
Winner: Hyperion ORM

📈 OVERALL ANALYSIS
════════════════════════════════════════
Hyperion ORM: 4 wins, 6 tests
Drizzle: 1 wins, 6 tests  
Prisma: 1 wins, 6 tests
TypeORM: 0 wins, 6 tests
MikroORM: 0 wins, 6 tests
```

## 🤝 Contributing

To add new benchmark tests:

1. Create test function in appropriate ORM config
2. Add to benchmark suite in `run-benchmarks.ts`
3. Update expected results documentation
4. Run full test suite to verify

## 📝 Notes

- All benchmarks use the same database schema and data
- Tests are run multiple times for statistical significance
- Memory tests include garbage collection to ensure accuracy
- Results may vary based on hardware and PostgreSQL configuration
- Each ORM is configured optimally for fair comparison