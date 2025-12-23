import type { ConfigValue } from '../types/index.js';

/**
 * Deep merge multiple objects. Later objects override earlier ones.
 * Arrays are not merged - they are replaced entirely.
 */
export function deepMerge<T extends Record<string, unknown>>(...objects: (T | null | undefined)[]): T {
  const result = {} as T;
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of Object.keys(obj) as (keyof T)[]) {
      const objValue = obj[key];
      const resultValue = result[key];
      if (
        objValue &&
        typeof objValue === 'object' &&
        !Array.isArray(objValue) &&
        resultValue &&
        typeof resultValue === 'object' &&
        !Array.isArray(resultValue)
      ) {
        result[key] = deepMerge(
          resultValue as Record<string, unknown>,
          objValue as Record<string, unknown>
        ) as T[keyof T];
      } else {
        result[key] = objValue as T[keyof T];
      }
    }
  }
  return result;
}

/**
 * Find the first null value in an object, returning its dot-notation path.
 */
export function findNullValue(obj: Record<string, ConfigValue>, path: string = ''): string | null {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (value === null) {
      return currentPath;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nullPath = findNullValue(value as Record<string, ConfigValue>, currentPath);
      if (nullPath) return nullPath;
    }
  }
  return null;
}
