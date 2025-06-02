/**
 * Schema builder with advanced TypeScript inference
 * Provides a fluent API for defining schemas with full type safety
 */

import {
  ColumnType,
  ColumnDefinition,
  EntitySchema,
  IndexDefinition,
  RelationDefinition,
  TypeMapping,
  InferEntity,
} from './types.js';

// Column builder for fluent API
export class ColumnBuilder<T extends ColumnType, Nullable extends boolean = false> {
  private definition: ColumnDefinition<T>;

  constructor(type: T) {
    this.definition = { type } as ColumnDefinition<T>;
  }

  nullable(): ColumnBuilder<T, true> {
    this.definition.nullable = true;
    return this as any;
  }

  unique(): this {
    this.definition.unique = true;
    return this;
  }

  primary(): this {
    this.definition.primary = true;
    return this;
  }

  default(
    value: TypeMapping[T] | (() => TypeMapping[T]) | 'now()' | 'gen_random_uuid()'
  ): this {
    this.definition.default = value;
    return this;
  }

  length(value: number): this {
    if (this.definition.type === 'string' || this.definition.type === 'text') {
      this.definition.length = value;
    }
    return this;
  }

  precision(value: number, scale?: number): this {
    if (this.definition.type === 'decimal') {
      this.definition.precision = value;
      if (scale !== undefined) {
        this.definition.scale = scale;
      }
    }
    return this;
  }

  build(): ColumnDefinition<T> {
    return this.definition;
  }

  // Type for the resulting field
  $type!: Nullable extends true ? TypeMapping[T] | null : TypeMapping[T];
}

// Schema builder for fluent API
export class SchemaBuilder<T extends Record<string, ColumnBuilder<any, any>>> {
  private schema: Partial<EntitySchema> = {};
  private columnsBuilders: T;

  constructor(name: string, columns: T) {
    this.schema.name = name;
    this.columnsBuilders = columns;
  }

  tableName(name: string): this {
    this.schema.tableName = name;
    return this;
  }

  relations(relations: { [key: string]: RelationDefinition }): this {
    this.schema.relations = relations;
    return this;
  }

  indexes(...indexes: IndexDefinition[]): this {
    this.schema.indexes = indexes;
    return this;
  }

  checks(...checks: { name: string; expression: string }[]): this {
    this.schema.checks = checks;
    return this;
  }

  build(): EntitySchema<{ [K in keyof T]: T[K]['$type'] }> {
    const columns: any = {};
    
    for (const [key, builder] of Object.entries(this.columnsBuilders)) {
      columns[key] = builder.build();
    }

    return {
      ...this.schema,
      columns,
    } as EntitySchema<{ [K in keyof T]: T[K]['$type'] }>;
  }
}

// Factory functions for column types
export const column = {
  string: () => new ColumnBuilder('string'),
  number: () => new ColumnBuilder('number'),
  bigint: () => new ColumnBuilder('bigint'),
  boolean: () => new ColumnBuilder('boolean'),
  date: () => new ColumnBuilder('date'),
  timestamp: () => new ColumnBuilder('timestamp'),
  uuid: () => new ColumnBuilder('uuid'),
  json: <T = unknown>() => new ColumnBuilder('json'),
  text: () => new ColumnBuilder('text'),
  decimal: () => new ColumnBuilder('decimal'),
};

// Main schema definition function
export function schema<T extends Record<string, ColumnBuilder<any, any>>>(
  name: string,
  columns: T
): SchemaBuilder<T> {
  return new SchemaBuilder(name, columns);
}

// Type utilities for working with schemas
export type ExtractEntityType<S> = S extends EntitySchema<infer T> ? T : never;

export type ExtractColumns<S> = S extends EntitySchema<any>
  ? S['columns']
  : never;

export type ExtractRelations<S> = S extends EntitySchema<any>
  ? S['relations']
  : never;

// Helper to get primary key fields
export function getPrimaryKeyFields<S extends EntitySchema>(
  schema: S
): (keyof S['columns'])[] {
  const primaryKeys: (keyof S['columns'])[] = [];
  
  for (const [field, column] of Object.entries(schema.columns)) {
    if ((column as ColumnDefinition).primary) {
      primaryKeys.push(field as keyof S['columns']);
    }
  }
  
  return primaryKeys;
}

// Helper to get unique fields
export function getUniqueFields<S extends EntitySchema>(
  schema: S
): (keyof S['columns'])[] {
  const uniqueFields: (keyof S['columns'])[] = [];
  
  for (const [field, column] of Object.entries(schema.columns)) {
    if ((column as ColumnDefinition).unique) {
      uniqueFields.push(field as keyof S['columns']);
    }
  }
  
  return uniqueFields;
}

// Validate schema consistency
export function validateSchema<S extends EntitySchema>(schema: S): void {
  const primaryKeys = getPrimaryKeyFields(schema);
  
  if (primaryKeys.length === 0) {
    throw new Error(`Schema ${schema.name} must have at least one primary key`);
  }
  
  // Validate indexes reference existing columns
  if (schema.indexes) {
    for (const index of schema.indexes) {
      for (const column of index.columns) {
        if (!(column in schema.columns)) {
          throw new Error(
            `Index references non-existent column: ${column} in schema ${schema.name}`
          );
        }
      }
    }
  }
  
  // Validate relations
  if (schema.relations) {
    for (const [name, relation] of Object.entries(schema.relations)) {
      if (relation.foreignKey && !(relation.foreignKey in schema.columns)) {
        throw new Error(
          `Relation ${name} references non-existent foreign key: ${relation.foreignKey}`
        );
      }
    }
  }
}