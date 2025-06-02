/**
 * Type definition exports
 */

// Base types for the ORM
export type Primitive = string | number | boolean | null | undefined | Date | bigint;

export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U>
  ? ReadonlyArray<DeepPartial<U>>
  : T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

// Database-specific types
export type DatabaseValue = string | number | boolean | null | Date | Buffer | bigint;

export type WhereOperator = 
  | '=' 
  | '!=' 
  | '<' 
  | '<=' 
  | '>' 
  | '>=' 
  | 'LIKE' 
  | 'NOT LIKE' 
  | 'IN' 
  | 'NOT IN' 
  | 'BETWEEN' 
  | 'NOT BETWEEN' 
  | 'IS NULL' 
  | 'IS NOT NULL';

export type OrderDirection = 'ASC' | 'DESC' | 'asc' | 'desc';

// Connection configuration
export interface ConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly ssl?: boolean | object;
  readonly connectionTimeoutMillis?: number;
  readonly idleTimeoutMillis?: number;
  readonly max?: number;
}