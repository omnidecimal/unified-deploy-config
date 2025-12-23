// Library entrypoint that exposes mergeConfig and related functions for consumers.
export { default as mergeConfig } from './lib/merge-config.js';
export {
  mergeConfig as mergeConfigFn,
  parseTarget,
  getRegionShortCode,
  getRegionFullName,
  AwsRegionMapping,
  AwsRegionToShortCode,
} from './lib/merge-config.js';
export { checkComponentAvailability, checkComponentValidity } from './lib/component-check.js';
export { deepMerge, findNullValue } from './lib/utils.js';
export { flatten } from './flatten.js';
export * from './types/index.js';
