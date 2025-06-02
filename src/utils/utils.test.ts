import { describe, it, expect } from 'vitest';
import {
  isString,
  isNumber,
  isBoolean,
  isNull,
  isUndefined,
  isObject,
  isArray,
  isDate,
  isBigInt,
  assert,
  assertDefined,
} from './index.js';

describe('Type Guards', () => {
  it('should correctly identify strings', () => {
    expect(isString('hello')).toBe(true);
    expect(isString('')).toBe(true);
    expect(isString(123)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });

  it('should correctly identify numbers', () => {
    expect(isNumber(123)).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isNumber(-123.45)).toBe(true);
    expect(isNumber(NaN)).toBe(true);
    expect(isNumber(Infinity)).toBe(true);
    expect(isNumber('123')).toBe(false);
    expect(isNumber(null)).toBe(false);
  });

  it('should correctly identify booleans', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(1)).toBe(false);
    expect(isBoolean('true')).toBe(false);
  });

  it('should correctly identify null', () => {
    expect(isNull(null)).toBe(true);
    expect(isNull(undefined)).toBe(false);
    expect(isNull(0)).toBe(false);
    expect(isNull('')).toBe(false);
  });

  it('should correctly identify undefined', () => {
    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);
    expect(isUndefined(0)).toBe(false);
    expect(isUndefined('')).toBe(false);
  });

  it('should correctly identify objects', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(new Date())).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject('object')).toBe(false);
  });

  it('should correctly identify arrays', () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
    expect(isArray(new Array())).toBe(true);
    expect(isArray({})).toBe(false);
    expect(isArray('array')).toBe(false);
  });

  it('should correctly identify dates', () => {
    expect(isDate(new Date())).toBe(true);
    expect(isDate(new Date('2023-01-01'))).toBe(true);
    expect(isDate('2023-01-01')).toBe(false);
    expect(isDate(1234567890)).toBe(false);
  });

  it('should correctly identify bigints', () => {
    expect(isBigInt(BigInt(123))).toBe(true);
    expect(isBigInt(123n)).toBe(true);
    expect(isBigInt(123)).toBe(false);
    expect(isBigInt('123')).toBe(false);
  });
});

describe('Assertion utilities', () => {
  it('should pass when condition is truthy', () => {
    expect(() => assert(true)).not.toThrow();
    expect(() => assert(1)).not.toThrow();
    expect(() => assert('string')).not.toThrow();
  });

  it('should throw when condition is falsy', () => {
    expect(() => assert(false)).toThrow('Assertion failed');
    expect(() => assert(0)).toThrow('Assertion failed');
    expect(() => assert('')).toThrow('Assertion failed');
    expect(() => assert(null)).toThrow('Assertion failed');
    expect(() => assert(undefined)).toThrow('Assertion failed');
  });

  it('should throw with custom message', () => {
    expect(() => assert(false, 'Custom error')).toThrow('Custom error');
  });

  it('should pass for defined values', () => {
    expect(() => assertDefined('value')).not.toThrow();
    expect(() => assertDefined(0)).not.toThrow();
    expect(() => assertDefined(false)).not.toThrow();
    expect(() => assertDefined('')).not.toThrow();
  });

  it('should throw for null or undefined', () => {
    expect(() => assertDefined(null)).toThrow('Value is null or undefined');
    expect(() => assertDefined(undefined)).toThrow('Value is null or undefined');
    expect(() => assertDefined(null, 'Custom message')).toThrow('Custom message');
  });
});