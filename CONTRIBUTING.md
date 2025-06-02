# Contributing to Hyperion ORM

Thank you for your interest in contributing to Hyperion ORM! We welcome contributions from the community and are excited to see what you'll build.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 13+
- Git
- TypeScript knowledge

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/hyperion-orm.git
   cd hyperion-orm
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Start Development**
   ```bash
   npm run dev
   ```

## 📝 How to Contribute

### Reporting Issues

Before creating an issue, please:

1. **Search existing issues** to avoid duplicates
2. **Use our issue templates** for bugs, features, or questions
3. **Provide detailed information** including:
   - Hyperion ORM version
   - Node.js and PostgreSQL versions
   - Steps to reproduce
   - Expected vs actual behavior
   - Code examples (minimal reproduction case)

### Submitting Pull Requests

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make Your Changes**
   - Follow our coding standards
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all tests pass

3. **Commit Your Changes**
   ```bash
   git commit -m "feat: add amazing feature"
   ```

4. **Push and Create PR**
   ```bash
   git push origin feature/amazing-feature
   ```

## 🏗️ Project Structure

```
hyperion-orm/
├── src/
│   ├── core/           # Core ORM functionality
│   │   ├── identity-map.ts      # WeakMap-based identity map
│   │   ├── change-tracker.ts    # Proxy-based change tracking
│   │   ├── unit-of-work.ts      # Transaction coordination
│   │   ├── connection-pool.ts   # Advanced connection pooling
│   │   └── transaction-manager.ts # Nested transactions & savepoints
│   ├── schema/         # Schema definition system
│   │   ├── builder.ts           # Fluent schema builder
│   │   ├── column.ts            # Column type definitions
│   │   └── types.ts             # TypeScript type utilities
│   ├── query/          # Query builder
│   │   ├── builder.ts           # Type-safe query builder
│   │   ├── conditions.ts        # Where clause conditions
│   │   └── sql-generator.ts     # SQL generation
│   ├── migrations/     # Migration system
│   │   ├── runner.ts            # Migration execution
│   │   ├── generator.ts         # Migration file generation
│   │   └── tracker.ts           # Migration state tracking
│   └── utils/          # Utility functions
├── tests/              # Test suites
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/            # End-to-end tests
├── examples/           # Usage examples
├── benchmarks/         # Performance comparisons
├── docs/              # Documentation
└── scripts/           # Build and development scripts
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/core/identity-map.test.ts

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Writing Tests

- Use **Vitest** for testing framework
- Follow **AAA pattern** (Arrange, Act, Assert)
- Test both **happy paths** and **error cases**
- Include **integration tests** for complex features
- Mock external dependencies appropriately

Example test structure:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityMap } from './identity-map.js';

describe('IdentityMap', () => {
  let identityMap: IdentityMap;

  beforeEach(() => {
    identityMap = new IdentityMap();
  });

  describe('get()', () => {
    it('should return stored entity', () => {
      // Arrange
      const entity = { id: 1, name: 'Test' };
      identityMap.set('User', 1, entity);

      // Act
      const result = identityMap.get('User', 1);

      // Assert
      expect(result).toBe(entity);
    });
  });
});
```

## 📏 Coding Standards

### TypeScript Guidelines

- **Strict TypeScript** - Enable all strict checks
- **No `any` types** - Use proper typing
- **Interface over type** - Use interfaces for object shapes
- **Explicit return types** - Always specify return types for public methods
- **Generic constraints** - Use constraints for better type safety

### Code Style

- **2 spaces** for indentation
- **Single quotes** for strings
- **Trailing commas** in multi-line objects/arrays
- **Semicolons** at end of statements
- **PascalCase** for classes and interfaces
- **camelCase** for variables and functions
- **UPPER_SNAKE_CASE** for constants

### File Naming

- **kebab-case** for file names
- **PascalCase** for class files
- **camelCase** for utility files
- **.test.ts** suffix for test files
- **.d.ts** suffix for type declarations

## 📚 Documentation

### Code Documentation

- **JSDoc comments** for all public APIs
- **Inline comments** for complex logic
- **Type annotations** for clarity
- **Examples** in documentation

Example:
```typescript
/**
 * Creates a new entity in the identity map with automatic change tracking
 * 
 * @param entityName - The name of the entity type
 * @param data - The entity data
 * @returns Proxied entity with change tracking enabled
 * 
 * @example
 * ```typescript
 * const user = uow.create('User', {
 *   email: 'john@example.com',
 *   name: 'John Doe'
 * });
 * ```
 */
create<T extends Record<string, unknown>>(
  entityName: string, 
  data: T
): T {
  // Implementation...
}
```

### Documentation Files

When adding new features, update:

- **README.md** - If it affects the public API
- **CHANGELOG.md** - All changes
- **docs/** - Detailed documentation
- **examples/** - Usage examples

## 🔧 Performance Guidelines

### Optimization Principles

1. **Memory Efficiency**
   - Use WeakMap for automatic garbage collection
   - Avoid memory leaks in long-running processes
   - Profile memory usage in tests

2. **Query Performance**
   - Minimize database round trips
   - Use connection pooling effectively
   - Optimize SQL generation

3. **Type System Performance**
   - Keep type computations minimal
   - Use cached types where possible
   - Avoid deeply nested conditional types

### Benchmarking

- **Add benchmarks** for new features
- **Compare with alternatives** 
- **Document performance characteristics**
- **Include in CI/CD** for regression detection

## 🐛 Debugging

### Common Issues

1. **WeakMap References**
   - Ensure objects aren't garbage collected prematurely
   - Use strong references when needed

2. **Proxy Behavior**
   - Be aware of proxy traps
   - Handle edge cases properly

3. **TypeScript Errors**
   - Check type inference paths
   - Verify generic constraints

## 🔄 Release Process

### Versioning

We follow **Semantic Versioning** (semver):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)  
- **PATCH**: Bug fixes (backward compatible)

### Commit Convention

We use **Conventional Commits**:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/tooling changes

Examples:
```
feat: add nested transaction support with savepoints
fix: resolve memory leak in identity map
docs: update query builder examples
```

## 💡 Feature Requests

### Proposing New Features

1. **Create an issue** with feature request template
2. **Describe the use case** and motivation
3. **Provide examples** of desired API
4. **Consider alternatives** and trade-offs
5. **Discuss implementation** approach

### Implementation Guidelines

- **Start with tests** - TDD approach
- **Maintain backward compatibility** 
- **Follow existing patterns**
- **Document thoroughly**
- **Add benchmarks** if performance-critical

## 🤝 Community

### Communication

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and ideas
- **GitHub Pull Requests** - Code contributions

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- **Be respectful** and constructive
- **Help others** learn and grow
- **Give credit** where it's due
- **Focus on** what's best for the community

## 🏆 Recognition

Contributors will be:

- **Listed in CONTRIBUTORS.md**
- **Credited in release notes**
- **Invited to join** the core team (for significant contributions)

Thank you for contributing to Hyperion ORM! 🚀