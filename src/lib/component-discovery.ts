import { deepMerge, findNullValue } from './utils.js';
import { getRegionShortCode } from './merge-config.js';
import type {
  DeploymentConfig,
  EnvironmentConfig,
  ComponentConfig,
  ComponentValidity,
  ComponentEnvironmentsResult,
  EnvironmentsResult,
  EnvironmentEnvLevelAvailability,
  EnvironmentComponentsAvailability,
  ComponentEnvLevelAvailability,
  RegionalComponentValidity,
  ConfigValue,
} from '../types/index.js';

/**
 * Check where a component has valid configuration across environments and regions.
 */
export function checkComponentAvailability(
  config: DeploymentConfig,
  componentName: string
): ComponentEnvironmentsResult {
  const envSource = config.environments;
  const environments: EnvironmentEnvLevelAvailability[] = [];

  if (envSource) {
    for (const envName of Object.keys(envSource)) {
      const envConfig = envSource[envName];
      const regions = envConfig?.regions ? Object.keys(envConfig.regions) : [];

      // Check environment level (no region)
      const envResult = checkComponentValidity(config, envSource, envName, null, componentName);

      // Check each region
      const regionResults: RegionalComponentValidity[] = [];
      for (const region of regions) {
        const regionResult = checkComponentValidity(config, envSource, envName, region, componentName);
        if (regionResult.valid) {
          const regionShort = getRegionShortCode(region);
          regionResults.push({ region, valid: true, hasConfig: regionResult.hasConfig, target: `${envName}-${regionShort}` });
        } else {
          regionResults.push({ region, valid: false, reason: regionResult.reason });
        }
      }

      // Environment is available if env-level is valid OR any region is valid
      const anyRegionValid = regionResults.some(r => r.valid);
      const isAvailable = envResult.valid || anyRegionValid;

      environments.push({
        environment: envName,
        available: isAvailable,
        envLevel: envResult.valid
          ? { valid: true, hasConfig: envResult.hasConfig, target: envName }
          : { valid: false, reason: envResult.reason },
        regions: regionResults.length > 0 ? regionResults : undefined
      });
    }
  }

  return { component: componentName, environments };
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
): ComponentValidity {
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

/**
 * Get all component names from the config.
 * Extracts from defaults, environment-level, and region-level configs.
 */
export function getAllComponentNames(config: DeploymentConfig): string[] {
  const keys = new Set<string>();
  const reservedKeys = new Set(['regions', 'accountId']);

  // From defaults
  if (config.defaults) {
    for (const key of Object.keys(config.defaults)) {
      keys.add(key);
    }
  }

  // From environments
  const envSource = config.environments;
  if (envSource) {
    for (const envName of Object.keys(envSource)) {
      const envConfig = envSource[envName];
      if (!envConfig) continue;

      // Environment-level components
      for (const key of Object.keys(envConfig)) {
        if (reservedKeys.has(key)) continue;
        const value = envConfig[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          keys.add(key);
        }
      }

      // Region-level components
      if (envConfig.regions) {
        for (const region of Object.keys(envConfig.regions)) {
          const regionConfig = envConfig.regions[region];
          if (!regionConfig) continue;
          for (const key of Object.keys(regionConfig)) {
            const value = regionConfig[key];
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
              keys.add(key);
            }
          }
        }
      }
    }
  }

  return Array.from(keys);
}

/**
 * Check all components availability across all environments/regions.
 * Used when no specific component is requested.
 */
export function checkAllComponentsAvailability(
  config: DeploymentConfig
): EnvironmentsResult {
  const envSource = config.environments;
  const environments: EnvironmentComponentsAvailability[] = [];

  if (!envSource) {
    return { environments };
  }

  const componentNames = getAllComponentNames(config);
  if (componentNames.length === 0) {
    return { environments };
  }

  for (const envName of Object.keys(envSource)) {
    const envConfig = envSource[envName];
    const regions = envConfig?.regions ? Object.keys(envConfig.regions) : [];

    const components: ComponentEnvLevelAvailability[] = [];

    for (const componentName of componentNames) {
      const envResult = checkComponentValidity(config, envSource, envName, null, componentName);

      // Check each region for this component
      const regionResults: RegionalComponentValidity[] = [];
      for (const region of regions) {
        const regionResult = checkComponentValidity(config, envSource, envName, region, componentName);
        if (regionResult.valid) {
          const regionShort = getRegionShortCode(region);
          regionResults.push({ region, valid: true, hasConfig: regionResult.hasConfig, target: `${envName}-${regionShort}` });
        } else {
          regionResults.push({ region, valid: false, reason: regionResult.reason });
        }
      }

      const anyRegionValid = regionResults.some(r => r.valid);

      components.push({
        component: componentName,
        available: envResult.valid || anyRegionValid,
        envLevel: envResult.valid
          ? { valid: true, hasConfig: envResult.hasConfig, target: envName }
          : { valid: false, reason: envResult.reason },
        regions: regionResults.length > 0 ? regionResults : undefined
      });
    }

    const anyComponentValid = components.some(c => c.available);

    environments.push({
      environment: envName,
      valid: anyComponentValid,
      components
    });
  }

  return { environments };
}
