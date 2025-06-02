/**
 * Core types for the schema definition system
 * Provides compile-time type safety without decorators
 */

// Supported column types
export type ColumnType =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'uuid'
  | 'json'
  | 'text'
  | 'decimal';

// Type mapping from schema types to TypeScript types
export type TypeMapping = {
  string: string;
  number: number;
  bigint: bigint;
  boolean: boolean;
  date: Date;
  timestamp: Date;
  uuid: string;
  json: unknown;
  text: string;
  decimal: string;
};

// Column definition
export interface ColumnDefinition<T extends ColumnType = ColumnType> {
  type: T;
  nullable?: boolean;
  unique?: boolean;
  primary?: boolean;
  default?: TypeMapping[T] | (() => TypeMapping[T]) | 'now()' | 'gen_random_uuid()';
  length?: number;
  precision?: number;
  scale?: number;
}

// Index definition
export interface IndexDefinition {
  columns: readonly string[];
  unique?: boolean;
  where?: string;
  using?: 'btree' | 'hash' | 'gin' | 'gist';
}

// Relation types
export type RelationType = 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';

// Relation definition
export interface RelationDefinition<T = any> {
  type: RelationType;
  target: () => EntitySchema<T>;
  foreignKey?: string;
  inverseSide?: string;
  through?: () => EntitySchema<any>;
  cascade?: boolean | ('insert' | 'update' | 'remove')[];
}

// Entity schema definition
export interface EntitySchema<T = any> {
  name: string;
  tableName?: string;
  columns: {
    [K in keyof T]: ColumnDefinition;
  };
  relations?: {
    [key: string]: RelationDefinition;
  };
  indexes?: readonly IndexDefinition[];
  checks?: readonly { name: string; expression: string }[];
}

// Infer entity type from schema
export type InferEntity<S extends EntitySchema> = {
  [K in keyof S['columns']]: S['columns'][K]['nullable'] extends true
    ? TypeMapping[S['columns'][K]['type']] | null
    : TypeMapping[S['columns'][K]['type']];
};

// Helper to create a typed schema
export function defineEntity<T>(): <S extends EntitySchema<T>>(schema: S) => S {
  return (schema) => schema;
}

// Relation helpers
export function hasOne<T>(
  target: () => EntitySchema<T>,
  foreignKey?: string,
  options?: Partial<RelationDefinition<T>>
): RelationDefinition<T> {
  return {
    type: 'hasOne',
    target,
    foreignKey,
    ...options,
  };
}

export function hasMany<T>(
  target: () => EntitySchema<T>,
  foreignKey?: string,
  options?: Partial<RelationDefinition<T>>
): RelationDefinition<T> {
  return {
    type: 'hasMany',
    target,
    foreignKey,
    ...options,
  };
}

export function belongsTo<T>(
  target: () => EntitySchema<T>,
  foreignKey?: string,
  options?: Partial<RelationDefinition<T>>
): RelationDefinition<T> {
  return {
    type: 'belongsTo',
    target,
    foreignKey,
    ...options,
  };
}

export function belongsToMany<T>(
  target: () => EntitySchema<T>,
  through: () => EntitySchema<any>,
  options?: Partial<RelationDefinition<T>>
): RelationDefinition<T> {
  return {
    type: 'belongsToMany',
    target,
    through,
    ...options,
  };
}