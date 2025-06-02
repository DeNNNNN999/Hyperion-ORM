/**
 * Utility function exports
 */

// Type guard utilities
export const isString = (value: unknown): value is string => typeof value === 'string';
export const isNumber = (value: unknown): value is number => typeof value === 'number';
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const isNull = (value: unknown): value is null => value === null;
export const isUndefined = (value: unknown): value is undefined => value === undefined;
export const isObject = (value: unknown): value is object => 
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
export const isDate = (value: unknown): value is Date => value instanceof Date;
export const isBigInt = (value: unknown): value is bigint => typeof value === 'bigint';
export const isBuffer = (value: unknown): value is Buffer => Buffer.isBuffer(value);

// Assertion utilities
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed');
  }
}

export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Value is null or undefined');
  }
}

// Deep clone utility with circular reference handling
export function deepClone<T>(obj: T, seen = new WeakMap()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Check for circular reference
  if (seen.has(obj)) {
    return seen.get(obj);
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  if (obj instanceof Array) {
    const clonedArr: any[] = [];
    seen.set(obj, clonedArr);
    for (let i = 0; i < obj.length; i++) {
      clonedArr[i] = deepClone(obj[i], seen);
    }
    return clonedArr as any;
  }

  if (obj instanceof Set) {
    const clonedSet = new Set();
    seen.set(obj, clonedSet);
    obj.forEach(value => {
      clonedSet.add(deepClone(value, seen));
    });
    return clonedSet as any;
  }

  if (obj instanceof Map) {
    const clonedMap = new Map();
    seen.set(obj, clonedMap);
    obj.forEach((value, key) => {
      clonedMap.set(deepClone(key, seen), deepClone(value, seen));
    });
    return clonedMap as any;
  }

  // Regular object
  const clonedObj: any = {};
  seen.set(obj, clonedObj);
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone((obj as any)[key], seen);
    }
  }
  
  return clonedObj;
}