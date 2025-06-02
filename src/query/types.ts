/**
 * Type definitions for the Query Builder
 * Provides compile-time type safety for all query operations
 */

import type { EntitySchema, InferEntity, TypeMapping, ColumnType } from '../schema/types.js';

// Operators for different column types
export type StringOperators = 
  | 'eq' | 'ne' | 'like' | 'ilike' | 'notLike' 
  | 'startsWith' | 'endsWith' | 'contains' | 'in' | 'notIn';

export type NumberOperators = 
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' 
  | 'between' | 'in' | 'notIn';

export type BooleanOperators = 'eq' | 'ne';

export type DateOperators = 
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' 
  | 'between' | 'year' | 'month' | 'day';

export type ArrayOperators = 
  | 'contains' | 'containedBy' | 'overlaps' | 'length';

// Map column types to their operators
export type OperatorsForType<T extends ColumnType> = 
  T extends 'string' | 'text' | 'uuid' ? StringOperators :
  T extends 'number' | 'bigint' | 'decimal' ? NumberOperators :
  T extends 'boolean' ? BooleanOperators :
  T extends 'date' | 'timestamp' ? DateOperators :
  T extends 'json' ? StringOperators | ArrayOperators :
  never;

// Value type for operators
export type OperatorValue<T, Op> = 
  Op extends 'in' | 'notIn' ? T[] :
  Op extends 'between' ? [T, T] :
  Op extends 'year' | 'month' | 'day' ? number :
  T;

// Where clause conditions
export type WhereCondition<S extends EntitySchema> = {
  [K in keyof S['columns']]?: 
    | TypeMapping[S['columns'][K]['type']]
    | null
    | {
        [Op in OperatorsForType<S['columns'][K]['type']>]?: 
          OperatorValue<TypeMapping[S['columns'][K]['type']], Op>
      };
} & {
  OR?: WhereCondition<S>[];
  AND?: WhereCondition<S>[];
  NOT?: WhereCondition<S>;
};

// Order by direction
export type OrderDirection = 'asc' | 'desc' | 'ASC' | 'DESC';

// Order by clause
export type OrderByClause<S extends EntitySchema> = {
  [K in keyof S['columns']]?: OrderDirection;
} | Array<{
  [K in keyof S['columns']]?: OrderDirection;
}>;

// Select specific fields
export type SelectFields<S extends EntitySchema> = 
  | (keyof S['columns'])[]
  | '*';

// Include relations
export type IncludeRelations<S extends EntitySchema> = S['relations'] extends infer R
  ? R extends Record<string, any>
    ? {
        [K in keyof R]?: boolean | {
          select?: SelectFields<any>;
          where?: WhereCondition<any>;
          orderBy?: OrderByClause<any>;
          limit?: number;
        };
      }
    : never
  : never;

// Query options
export interface QueryOptions<S extends EntitySchema> {
  where?: WhereCondition<S>;
  select?: SelectFields<S>;
  include?: IncludeRelations<S>;
  orderBy?: OrderByClause<S>;
  limit?: number;
  offset?: number;
  distinct?: boolean | (keyof S['columns'])[];
  groupBy?: (keyof S['columns'])[];
  having?: WhereCondition<S>;
}

// Result type based on select and include
export type QueryResult<
  S extends EntitySchema,
  Options extends QueryOptions<S>
> = Options['select'] extends (keyof S['columns'])[]
  ? Pick<InferEntity<S>, Options['select'][number]>
  : Options['select'] extends '*'
    ? InferEntity<S>
    : InferEntity<S>;

// Join types
export type JoinType = 'inner' | 'left' | 'right' | 'full';

// Aggregate functions
export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';

// Raw SQL template literal
export interface RawSQL {
  sql: string;
  values: unknown[];
}

// Transaction isolation levels
export type IsolationLevel = 
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

// Query execution result
export interface QueryExecutionResult {
  rows: unknown[];
  rowCount: number;
  duration: number;
}