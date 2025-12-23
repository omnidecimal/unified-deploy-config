import { deepMerge, findNullValue } from './utils.js';
import { getRegionShortCode } from './merge-config.js';
import type {
  DeploymentConfig,
  EnvironmentConfig,
  ComponentConfig,
  ComponentValidityResult,
  EnvironmentComponentResult,
  RegionValidityResult,
  ConfigValue,
} from '../types/index.js';

/**
 * Check where a component has valid configuration across environments and regions.
 */
export function checkComponentAvailability(
  config: DeploymentConfig,
  componentName: string
): EnvironmentComponentResult[] {
  const envSource = config.accounts ?? config.environments;

  if (!envSource) {
    return [];
  }

  const results: EnvironmentComponentResult[] = [];

  for (const envName of Object.keys(envSource)) {
    const envConfig = envSource[envName];
    const regions = envConfig?.regions ? Object.keys(envConfig.regions) : [];

    // Check environment level (no region)
    const envResult = checkComponentValidity(config, envSource, envName, null, componentName);

    // Check each region
    const regionResults: RegionValidityResult[] = [];
    for (const region of regions) {
      const regionResult = checkComponentValidity(config, envSource, envName, region, componentName);
      const regionShort = getRegionShortCode(region);
      if (regionResult.valid) {
        regionResults.push({ region, regionShort, valid: true, hasConfig: regionResult.hasConfig });
      } else {
        regionResults.push({ region, regionShort, valid: false, reason: regionResult.reason });
      }
    }

    // Environment is valid if env-level is valid OR any region is valid
    const anyRegionValid = regionResults.some(r => r.valid);
    const isValid = envResult.valid || anyRegionValid;

    results.push({
      environment: envName,
      valid: isValid,
      envLevel: envResult.valid
        ? { valid: true, hasConfig: envResult.hasConfig }
        : { valid: false, reason: envResult.reason },
      regions: regionResults.length > 0 ? regionResults : undefined
    });
  }

  return results;
}

/**
 * Check if a component has valid configuration for a specific environment/region.
 */
export function checkComponentValidity(
  config: DeploymentConfig,
  envSource: Record<string, EnvironmentConfig>,
  envName: string,
  region: string | null,
  componentName: string
): ComponentValidityResult {
  const defaults = config.defaults ?? {};
  const envConfig = envSource[envName] ?? {};
  const regionConfig = region ? (envConfig.regions?.[region] ?? {}) : {};

  // Get component config at each level
  const defaultComp = defaults[componentName] as ComponentConfig | undefined;
  const envComp = envConfig[componentName] as ComponentConfig | undefined;
  const regionComp = regionConfig[componentName] as ComponentConfig | undefined;

  // Component must exist at some level
  if (!defaultComp && !envComp && !regionComp) {
    return { valid: false, reason: 'component_not_found' };
  }

  // Deep merge the component configs
  const merged = deepMerge(defaultComp ?? {}, envComp ?? {}, regionComp ?? {});

  // Check for null values
  const nullPath = findNullValue(merged as Record<string, ConfigValue>);
  if (nullPath) {
    return { valid: false, reason: `null_value_at_${nullPath}` };
  }

  // Check if there's explicit config at this level (env or region)
  const hasConfig = region
    ? Boolean(regionComp && Object.keys(regionComp).length > 0)
    : Boolean(envComp && Object.keys(envComp).length > 0);

  return { valid: true, hasConfig };
}
