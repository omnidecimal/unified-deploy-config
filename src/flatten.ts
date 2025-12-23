import type { ConfigValue } from './types/index.js';

/**
 * Flatten a nested object into a single-level object with dot-notation keys.
 */
export function flatten(
  obj: Record<string, ConfigValue>,
  prefix: string = '',
  delimiter: string = '.'
): Record<string, string | number | boolean | (string | number | boolean)[]> {
  const result: Record<string, string | number | boolean | (string | number | boolean)[]> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}${delimiter}${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flatten(v as Record<string, ConfigValue>, key, delimiter));
    } else {
      result[key] = v as string | number | boolean | (string | number | boolean)[];
    }
  }
  return result;
}

export default flatten;
