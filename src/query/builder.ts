/**
 * Type-safe Query Builder with perfect TypeScript inference
 * Generates SQL while maintaining full type safety
 */

import type {
  EntitySchema,
  InferEntity,
  TypeMapping,
} from '../schema/types.js';

import type {
  WhereCondition,
  OrderByClause,
  SelectFields,
  IncludeRelations,
  QueryOptions,
  QueryResult,
  JoinType,
  AggregateFunction,
  RawSQL,
  OperatorsForType,
  OperatorValue,
} from './types.js';

import { Connection } from '../core/connection.js';

// Helper to create raw SQL
export function raw(sql: string, ...values: unknown[]): RawSQL {
  return { sql, values };
}

// Query builder class
export class QueryBuilder<
  S extends EntitySchema,
  Result = InferEntity<S>,
  Selected = InferEntity<S>
> {
  private schema: S;
  private connection: Connection | null = null;
  private queryParts: {
    select: string[];
    from: string;
    joins: Array<{ type: JoinType; table: string; on: string }>;
    where: string[];
    groupBy: string[];
    having: string[];
    orderBy: string[];
    limit?: number;
    offset?: number;
    distinct: boolean;
    distinctOn: string[];
  };
  private parameters: unknown[] = [];
  private parameterIndex = 1;

  constructor(schema: S, connection?: Connection) {
    this.schema = schema;
    this.connection = connection || null;
    this.queryParts = {
      select: ['*'],
      from: schema.tableName || schema.name.toLowerCase() + 's',
      joins: [],
      where: [],
      groupBy: [],
      having: [],
      orderBy: [],
      distinct: false,
      distinctOn: [],
    };
  }

  // Set connection
  setConnection(connection: Connection): this {
    this.connection = connection;
    return this;
  }

  // Select specific fields
  select<K extends keyof S['columns']>(
    ...fields: K[]
  ): QueryBuilder<S, Pick<InferEntity<S>, K>, Pick<InferEntity<S>, K>> {
    this.queryParts.select = fields.map(f => this.columnName(f as string));
    return this as any;
  }

  // Select with aliases
  selectAs<T extends Record<string, keyof S['columns'] | RawSQL>>(
    fields: T
  ): QueryBuilder<S, { [K in keyof T]: InferEntity<S>[T[K] extends keyof S['columns'] ? T[K] : never] }, Selected> {
    this.queryParts.select = Object.entries(fields).map(([alias, field]) => {
      if (typeof field === 'object' && 'sql' in field) {
        return `(${field.sql}) AS ${alias}`;
      }
      return `${this.columnName(field as string)} AS ${alias}`;
    });
    return this as any;
  }

  // Where conditions
  where(conditions: WhereCondition<S>): this {
    const whereClauses = this.buildWhereClause(conditions);
    if (whereClauses) {
      this.queryParts.where.push(whereClauses);
    }
    return this;
  }

  // And where
  andWhere(conditions: WhereCondition<S>): this {
    return this.where(conditions);
  }

  // Or where
  orWhere(conditions: WhereCondition<S>): this {
    const whereClauses = this.buildWhereClause(conditions);
    if (whereClauses && this.queryParts.where.length > 0) {
      const lastIndex = this.queryParts.where.length - 1;
      this.queryParts.where[lastIndex] = 
        `(${this.queryParts.where[lastIndex]}) OR (${whereClauses})`;
    } else if (whereClauses) {
      this.queryParts.where.push(whereClauses);
    }
    return this;
  }

  // Order by
  orderBy(orderBy: OrderByClause<S>): this {
    if (Array.isArray(orderBy)) {
      orderBy.forEach(order => this.addOrderBy(order));
    } else {
      this.addOrderBy(orderBy);
    }
    return this;
  }

  // Group by
  groupBy(...fields: (keyof S['columns'])[]): this {
    this.queryParts.groupBy = fields.map(f => this.columnName(f as string));
    return this;
  }

  // Having
  having(conditions: WhereCondition<S>): this {
    const havingClauses = this.buildWhereClause(conditions);
    if (havingClauses) {
      this.queryParts.having.push(havingClauses);
    }
    return this;
  }

  // Limit
  limit(limit: number): this {
    this.queryParts.limit = limit;
    return this;
  }

  // Offset
  offset(offset: number): this {
    this.queryParts.offset = offset;
    return this;
  }

  // Distinct
  distinct(on?: (keyof S['columns'])[]): this {
    this.queryParts.distinct = true;
    if (on) {
      this.queryParts.distinctOn = on.map(f => this.columnName(f as string));
    }
    return this;
  }

  // Inner join
  innerJoin<T extends EntitySchema>(
    table: T,
    on: (qb: JoinConditionBuilder<S, T>) => void
  ): this {
    return this.addJoin('inner', table, on);
  }

  // Left join
  leftJoin<T extends EntitySchema>(
    table: T,
    on: (qb: JoinConditionBuilder<S, T>) => void
  ): this {
    return this.addJoin('left', table, on);
  }

  // Right join
  rightJoin<T extends EntitySchema>(
    table: T,
    on: (qb: JoinConditionBuilder<S, T>) => void
  ): this {
    return this.addJoin('right', table, on);
  }

  // Full join
  fullJoin<T extends EntitySchema>(
    table: T,
    on: (qb: JoinConditionBuilder<S, T>) => void
  ): this {
    return this.addJoin('full', table, on);
  }

  // Aggregate functions
  count(field?: keyof S['columns']): Promise<number> {
    const column = field ? this.columnName(field as string) : '*';
    this.queryParts.select = [`COUNT(${column}) AS count`];
    return this.execute().then(result => parseInt(result.rows[0]?.count || '0'));
  }

  sum<K extends keyof S['columns']>(
    field: K
  ): Promise<number | null> {
    this.queryParts.select = [`SUM(${this.columnName(field as string)}) AS sum`];
    return this.execute().then(result => 
      result.rows[0]?.sum ? parseFloat(result.rows[0].sum) : null
    );
  }

  avg<K extends keyof S['columns']>(
    field: K
  ): Promise<number | null> {
    this.queryParts.select = [`AVG(${this.columnName(field as string)}) AS avg`];
    return this.execute().then(result => 
      result.rows[0]?.avg ? parseFloat(result.rows[0].avg) : null
    );
  }

  min<K extends keyof S['columns']>(
    field: K
  ): Promise<TypeMapping[S['columns'][K]['type']] | null> {
    this.queryParts.select = [`MIN(${this.columnName(field as string)}) AS min`];
    return this.execute().then(result => result.rows[0]?.min || null);
  }

  max<K extends keyof S['columns']>(
    field: K
  ): Promise<TypeMapping[S['columns'][K]['type']] | null> {
    this.queryParts.select = [`MAX(${this.columnName(field as string)}) AS max`];
    return this.execute().then(result => result.rows[0]?.max || null);
  }

  // Build and get SQL
  toSQL(): { sql: string; parameters: unknown[] } {
    const parts: string[] = [];

    // SELECT
    const selectClause = this.queryParts.distinct
      ? this.queryParts.distinctOn.length > 0
        ? `SELECT DISTINCT ON (${this.queryParts.distinctOn.join(', ')}) ${this.queryParts.select.join(', ')}`
        : `SELECT DISTINCT ${this.queryParts.select.join(', ')}`
      : `SELECT ${this.queryParts.select.join(', ')}`;
    parts.push(selectClause);

    // FROM
    parts.push(`FROM ${this.queryParts.from}`);

    // JOINS
    this.queryParts.joins.forEach(join => {
      parts.push(`${join.type.toUpperCase()} JOIN ${join.table} ON ${join.on}`);
    });

    // WHERE
    if (this.queryParts.where.length > 0) {
      parts.push(`WHERE ${this.queryParts.where.join(' AND ')}`);
    }

    // GROUP BY
    if (this.queryParts.groupBy.length > 0) {
      parts.push(`GROUP BY ${this.queryParts.groupBy.join(', ')}`);
    }

    // HAVING
    if (this.queryParts.having.length > 0) {
      parts.push(`HAVING ${this.queryParts.having.join(' AND ')}`);
    }

    // ORDER BY
    if (this.queryParts.orderBy.length > 0) {
      parts.push(`ORDER BY ${this.queryParts.orderBy.join(', ')}`);
    }

    // LIMIT
    if (this.queryParts.limit !== undefined) {
      parts.push(`LIMIT ${this.queryParts.limit}`);
    }

    // OFFSET
    if (this.queryParts.offset !== undefined) {
      parts.push(`OFFSET ${this.queryParts.offset}`);
    }

    return {
      sql: parts.join(' '),
      parameters: this.parameters,
    };
  }

  // Execute query and return raw results
  async execute(): Promise<{ rows: any[]; rowCount: number; duration: number }> {
    if (!this.connection) {
      throw new Error('No connection set for query builder');
    }

    const { sql, parameters } = this.toSQL();
    const startTime = Date.now();
    
    const result = await this.connection.query(sql, parameters);
    
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      duration: Date.now() - startTime,
    };
  }

  // Execute and return typed results
  async many(): Promise<Result[]> {
    const result = await this.execute();
    return result.rows as Result[];
  }

  // Execute and return first result
  async one(): Promise<Result | null> {
    this.limit(1);
    const results = await this.many();
    return results[0] || null;
  }

  // Execute and return first result or throw
  async oneOrFail(): Promise<Result> {
    const result = await this.one();
    if (!result) {
      throw new Error('No result found');
    }
    return result;
  }

  // Private helper methods
  private columnName(field: string): string {
    // In real implementation, would map from entity field to column name
    return field;
  }

  private addParameter(value: unknown): string {
    this.parameters.push(value);
    return `$${this.parameterIndex++}`;
  }

  private buildWhereClause(conditions: WhereCondition<S>): string {
    const clauses: string[] = [];

    for (const [field, condition] of Object.entries(conditions)) {
      if (field === 'OR' && Array.isArray(condition)) {
        const orClauses = condition.map(c => this.buildWhereClause(c)).filter(Boolean);
        if (orClauses.length > 0) {
          clauses.push(`(${orClauses.join(' OR ')})`);
        }
      } else if (field === 'AND' && Array.isArray(condition)) {
        const andClauses = condition.map(c => this.buildWhereClause(c)).filter(Boolean);
        if (andClauses.length > 0) {
          clauses.push(`(${andClauses.join(' AND ')})`);
        }
      } else if (field === 'NOT' && condition) {
        const notClause = this.buildWhereClause(condition);
        if (notClause) {
          clauses.push(`NOT (${notClause})`);
        }
      } else {
        const column = this.columnName(field);
        
        if (condition === null) {
          clauses.push(`${column} IS NULL`);
        } else if (condition === undefined) {
          // Skip undefined values
        } else if (typeof condition === 'object' && !Array.isArray(condition)) {
          // Handle operators
          for (const [op, value] of Object.entries(condition)) {
            clauses.push(this.buildOperatorClause(column, op, value));
          }
        } else {
          // Direct equality
          clauses.push(`${column} = ${this.addParameter(condition)}`);
        }
      }
    }

    return clauses.join(' AND ');
  }

  private buildOperatorClause(column: string, operator: string, value: unknown): string {
    switch (operator) {
      case 'eq':
        return `${column} = ${this.addParameter(value)}`;
      case 'ne':
        return `${column} != ${this.addParameter(value)}`;
      case 'gt':
        return `${column} > ${this.addParameter(value)}`;
      case 'gte':
        return `${column} >= ${this.addParameter(value)}`;
      case 'lt':
        return `${column} < ${this.addParameter(value)}`;
      case 'lte':
        return `${column} <= ${this.addParameter(value)}`;
      case 'like':
        return `${column} LIKE ${this.addParameter(value)}`;
      case 'ilike':
        return `${column} ILIKE ${this.addParameter(value)}`;
      case 'notLike':
        return `${column} NOT LIKE ${this.addParameter(value)}`;
      case 'startsWith':
        return `${column} LIKE ${this.addParameter(value + '%')}`;
      case 'endsWith':
        return `${column} LIKE ${this.addParameter('%' + value)}`;
      case 'contains':
        return `${column} LIKE ${this.addParameter('%' + value + '%')}`;
      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          const params = value.map(v => this.addParameter(v)).join(', ');
          return `${column} IN (${params})`;
        }
        return '1=0'; // Always false for empty array
      case 'notIn':
        if (Array.isArray(value) && value.length > 0) {
          const params = value.map(v => this.addParameter(v)).join(', ');
          return `${column} NOT IN (${params})`;
        }
        return '1=1'; // Always true for empty array
      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          return `${column} BETWEEN ${this.addParameter(value[0])} AND ${this.addParameter(value[1])}`;
        }
        throw new Error('Between operator requires array of two values');
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  private addOrderBy(orderBy: Record<string, string>): void {
    for (const [field, direction] of Object.entries(orderBy)) {
      this.queryParts.orderBy.push(
        `${this.columnName(field)} ${direction.toUpperCase()}`
      );
    }
  }

  private addJoin<T extends EntitySchema>(
    type: JoinType,
    table: T,
    onBuilder: (qb: JoinConditionBuilder<S, T>) => void
  ): this {
    const joinBuilder = new JoinConditionBuilder<S, T>(this.schema, table);
    onBuilder(joinBuilder);
    
    this.queryParts.joins.push({
      type,
      table: table.tableName || table.name.toLowerCase() + 's',
      on: joinBuilder.build(),
    });
    
    return this;
  }
}

// Join condition builder
class JoinConditionBuilder<S1 extends EntitySchema, S2 extends EntitySchema> {
  private conditions: string[] = [];

  constructor(
    private schema1: S1,
    private schema2: S2
  ) {}

  on<K1 extends keyof S1['columns'], K2 extends keyof S2['columns']>(
    field1: K1,
    field2: K2
  ): this {
    this.conditions.push(`${field1 as string} = ${field2 as string}`);
    return this;
  }

  and<K1 extends keyof S1['columns'], K2 extends keyof S2['columns']>(
    field1: K1,
    field2: K2
  ): this {
    return this.on(field1, field2);
  }

  build(): string {
    return this.conditions.join(' AND ');
  }
}

// Factory function to create query builder
export function createQueryBuilder<S extends EntitySchema>(
  schema: S,
  connection?: Connection
): QueryBuilder<S> {
  return new QueryBuilder(schema, connection);
}