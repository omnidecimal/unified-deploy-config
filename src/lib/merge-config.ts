import fs from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';
import { deepMerge } from './utils.js';
import type {
  RegionShortCode,
  RegionFullName,
  MergeConfigOptions,
  MergedConfig,
  FlattenedConfig,
  ParsedTarget,
  DeploymentConfig,
  EnvironmentConfig,
  ComponentConfig,
  ConfigValue,
} from '../types/index.js';

/**
 * Strip metadata keys (those starting with underscore) from a config object.
 * These are configuration behavior flags, not actual config values.
 */
function stripMetadataKeys(obj: Record<string, ConfigValue>): Record<string, ConfigValue> {
  const result: Record<string, ConfigValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip metadata keys (those starting with underscore)
    if (key.startsWith('_')) continue;

    // Recursively strip from nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripMetadataKeys(value as Record<string, ConfigValue>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Region mapping: short code -> full name
export const AwsRegionMapping: Record<RegionShortCode, RegionFullName> = {
  'use1': 'us-east-1',
  'use2': 'us-east-2',
  'usw1': 'us-west-1',
  'usw2': 'us-west-2',
  'cac1': 'ca-central-1',
  'euw1': 'eu-west-1',
  'euw2': 'eu-west-2',
  'euw3': 'eu-west-3',
  'euc1': 'eu-central-1',
  'eun1': 'eu-north-1',
  'aps1': 'ap-south-1',
  'apne1': 'ap-northeast-1',
  'apne2': 'ap-northeast-2',
  'apne3': 'ap-northeast-3',
  'apse1': 'ap-southeast-1',
  'apse2': 'ap-southeast-2',
  'apse3': 'ap-southeast-3',
  'ape1': 'ap-east-1',
  'sae1': 'sa-east-1'
};

// Reverse mapping: full name -> short code
export const AwsRegionToShortCode: Record<RegionFullName, RegionShortCode> = Object.fromEntries(
  Object.entries(AwsRegionMapping).map(([short, full]) => [full, short])
) as Record<RegionFullName, RegionShortCode>;

/**
 * Get the short region code from a full region name.
 */
export function getRegionShortCode(fullRegion: string): string {
  return AwsRegionToShortCode[fullRegion as RegionFullName] ?? fullRegion;
}

/**
 * Get the full region name from a short code.
 */
export function getRegionFullName(shortCode: string): string {
  return AwsRegionMapping[shortCode as RegionShortCode] ?? shortCode;
}

/**
 * Parse a target ID into environment and region components.
 * Target format: environmentname[-region] where region can be either:
 *   - Short code (e.g., 'dev-usw2')
 *   - Full region name (e.g., 'dev-us-west-2')
 * Returns the full region name (e.g., 'us-west-2') in the result.
 */
export function parseTarget(target: string): ParsedTarget {
  // Try to find a full region name at the end of the target first (longer match takes priority)
  for (const fullRegion of Object.values(AwsRegionMapping) as RegionFullName[]) {
    const suffix = `-${fullRegion}`;
    if (target.endsWith(suffix)) {
      return {
        env: target.slice(0, -suffix.length),
        region: fullRegion
      };
    }
  }

  // Try to find a region short code at the end of the target
  for (const regionCode of Object.keys(AwsRegionMapping) as RegionShortCode[]) {
    const suffix = `-${regionCode}`;
    if (target.endsWith(suffix)) {
      return {
        env: target.slice(0, -suffix.length),
        region: AwsRegionMapping[regionCode]
      };
    }
  }

  // No region found, entire target is the environment name
  return { env: target, region: undefined };
}

interface DetermineEnvironmentResult {
  envName: string;
  envConfigName: string;
  isEphemeral: boolean;
}

export function mergeConfig(options: MergeConfigOptions): MergedConfig | FlattenedConfig {
  const {
    configFile,
    env,
    region,
    output,
    delimiter,
    ephemeralBranchPrefix,
    disableEphemeralBranchCheck,
    branchName,
    component
  } = options;

  const config: DeploymentConfig = typeof configFile === 'string'
    ? JSON5.parse(fs.readFileSync(path.resolve(configFile), 'utf8')) as DeploymentConfig
    : configFile;

  const envSource = config.environments;

  // Handle ephemeral environments
  const { envName, envConfigName, isEphemeral } = determineEnvironment();

  // Convert region to full name if it's a short code
  const fullRegion = region ? (AwsRegionMapping[region as RegionShortCode] ?? region) : region;
  const shortRegion = region
    ? (Object.keys(AwsRegionMapping).find(key => AwsRegionMapping[key as RegionShortCode] === fullRegion) ?? region)
    : region;

  // Validate environment exists (using envConfigName to support ephemeral cases)
  if (!envSource || !envSource[envConfigName]) {
    throw new Error(`Environment '${envConfigName}' not found in config file`);
  }

  // Validate region exists in mapping if provided (can use either full region name or short code)
  if (region && !AwsRegionMapping[region as RegionShortCode] && !Object.values(AwsRegionMapping).includes(region as RegionFullName)) {
    throw new Error(`Region '${region}' is not a valid region code or name`);
  }

  // Helper to check if a component is region-agnostic (merges defaults + env level)
  function isComponentRegionAgnostic(componentName: string): boolean {
    const defaultComp = config.defaults?.[componentName] as ComponentConfig | undefined;
    const envComp = envSource?.[envConfigName]?.[componentName] as ComponentConfig | undefined;
    const merged = deepMerge(defaultComp ?? {}, envComp ?? {});
    return merged._regionAgnostic === true;
  }

  // Validate that region is provided if a specific component is requested that requires a region
  // If no specific component is requested, we'll filter out non-region-agnostic components later
  const envRegions = envSource[envConfigName]?.regions;
  const envHasRegions = envRegions && Object.keys(envRegions).length > 0;
  if (component && envHasRegions && !region && !isComponentRegionAgnostic(component)) {
    const availableRegions = Object.keys(envRegions).join(', ');
    throw new Error(`Environment '${envConfigName}' has regions defined. You must specify a region. Available regions: ${availableRegions}`);
  }

  function determineEnvironment(): DetermineEnvironmentResult {
    let resultEnvName = env;
    let resultEnvConfigName = env;
    let resultIsEphemeral = false;

    // If a direct match for the env is found in the config, we can return early, unless it's 'ephemeral'.
    if (env !== 'ephemeral' && envSource && envSource[env]) {
      return { envName: resultEnvName, envConfigName: resultEnvConfigName, isEphemeral: false };
    }

    // From here, we are either dealing with an explicit 'ephemeral' env or an env not found in the config.
    // Both cases might be ephemeral environments.

    if (env === 'ephemeral' && envSource && envSource[env]) {
      resultEnvConfigName = 'ephemeral';
      resultIsEphemeral = true;
    }

    if (!ephemeralBranchPrefix || ephemeralBranchPrefix.trim() === '') {
      // Ephemeral logic is disabled, and we already checked for direct matches.
      if (!resultIsEphemeral) {
        throw new Error(`Environment '${env}' not found in config file`);
      }
    } else if (disableEphemeralBranchCheck) {
      // Trust that this is an ephemeral environment without checking the branch name.
      resultIsEphemeral = true;
      resultEnvConfigName = 'ephemeral';
      // Note: envName remains as the input 'env' since we can't derive it from a branch.
    } else if (branchName) {
      const ephemeralPattern = new RegExp(`^${ephemeralBranchPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9_-]+$`);

      if (ephemeralPattern.test(branchName)) {
        const branchEnvName = branchName.substring(ephemeralBranchPrefix.length);

        // If env was specified (and not 'ephemeral'), it must match the branch-derived name.
        if (env !== 'ephemeral' && env !== branchEnvName && env !== branchName) {
          throw new Error(`Ephemeral environment name '${env}' does not match the branch name '${branchName}'`);
        }

        resultIsEphemeral = true;
        resultEnvName = branchEnvName;
        resultEnvConfigName = 'ephemeral';
      } else {
        // Branch name is present but does not match the ephemeral pattern.
        throw new Error(`Ephemeral environment branches must follow the format '${ephemeralBranchPrefix}<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: ${branchName}`);
      }
    } else if (env === 'ephemeral') {
      // If env is 'ephemeral' but we have no branch name to derive the real name from,
      // we'll proceed with 'ephemeral' as the envName.
      resultIsEphemeral = true;
      resultEnvName = 'ephemeral';
      resultEnvConfigName = 'ephemeral';
    }

    if (resultIsEphemeral) {
      return { envName: resultEnvName, envConfigName: resultEnvConfigName, isEphemeral: resultIsEphemeral };
    }

    // If we've reached here, it means it wasn't a direct match and didn't qualify as an ephemeral environment.
    throw new Error(`Environment '${env}' not found in config file`);
  }

  function getMergedComponentConfig(componentName: string): ComponentConfig {
    const defaultComp = config.defaults?.[componentName] ?? {};
    const envComp = (envSource?.[envConfigName]?.[componentName] as ComponentConfig | undefined) ?? {};
    const regionComp = fullRegion
      ? ((envSource?.[envConfigName]?.regions?.[fullRegion]?.[componentName] as ComponentConfig | undefined) ?? {})
      : {};
    const merged = deepMerge(defaultComp, envComp, regionComp);
    // Strip metadata keys (like _regionAgnostic) from the output
    return stripMetadataKeys(merged) as ComponentConfig;
  }

  function getAllComponentKeys(): string[] {
    const keys = new Set<string>();
    function isComponent(configObj: Record<string, unknown>, key: string): boolean {
      const value = configObj[key];
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    if (config.defaults) {
      Object.keys(config.defaults).filter(k => isComponent(config.defaults!, k)).forEach(k => keys.add(k));
    }
    if (envSource?.[envConfigName]) {
      const envConfig = envSource[envConfigName];
      Object.keys(envConfig).filter(k => isComponent(envConfig as Record<string, unknown>, k) && k !== 'regions').forEach(k => keys.add(k));
      if (fullRegion && envConfig.regions?.[fullRegion]) {
        const regionConfig = envConfig.regions[fullRegion];
        Object.keys(regionConfig).filter(k => isComponent(regionConfig as Record<string, unknown>, k)).forEach(k => keys.add(k));
      }
    }
    return Array.from(keys);
  }

  function getGlobalMerged(): Record<string, ConfigValue> {
    function isNonComponent([, v]: [string, unknown]): boolean {
      return typeof v !== 'object' || v === null || Array.isArray(v);
    }
    const d = Object.fromEntries(Object.entries(config.defaults ?? {}).filter(isNonComponent));
    const e = Object.fromEntries(Object.entries(envSource?.[envConfigName] ?? {}).filter(isNonComponent));
    const r = fullRegion
      ? Object.fromEntries(Object.entries(envSource?.[envConfigName]?.regions?.[fullRegion] ?? {}).filter(isNonComponent))
      : {};
    return deepMerge(d, e, r) as Record<string, ConfigValue>;
  }

  const allComponentKeys = getAllComponentKeys();
  let merged: Record<string, ConfigValue>;
  let finalResult: Record<string, ConfigValue>;

  if (component) {
    // Specific component requested - verify it exists first
    if (!allComponentKeys.includes(component)) {
      throw new Error(`Component '${component}' not found or is not a valid component in the merged configuration`);
    }

    const componentConfig = getMergedComponentConfig(component);
    merged = {
      ...getGlobalMerged(),
      [component]: componentConfig,
    };

    // Get non-component properties to preserve
    const nonComponentProps = getGlobalMerged();

    // Hoist the specified component to root level while preserving non-component metadata
    finalResult = {
      ...nonComponentProps,
      ...(componentConfig as Record<string, ConfigValue>),
    };
  } else {
    // No specific component - filter out invalid components:
    // 1. Those with null values
    // 2. Non-region-agnostic components when no region is provided and env has regions
    const validComponents: [string, ComponentConfig][] = [];
    for (const key of allComponentKeys) {
      // Skip non-region-agnostic components when no region is provided for an env with regions
      if (envHasRegions && !region && !isComponentRegionAgnostic(key)) {
        continue;
      }
      const compConfig = getMergedComponentConfig(key);
      if (!hasNullValues(compConfig)) {
        validComponents.push([key, compConfig]);
      }
    }

    // Throw error if all components are invalid
    if (validComponents.length === 0 && allComponentKeys.length > 0) {
      throw new Error(`No valid components found for target. All components contain null values.`);
    }

    merged = {
      ...getGlobalMerged(),
      ...Object.fromEntries(validComponents),
    };
    finalResult = merged;
  }

  // Add common dynamic metadata to the merged result (environment, region, etc)
  finalResult.env_name = envName;
  finalResult.env_config_name = envConfigName;
  finalResult.region = fullRegion ?? '';
  finalResult.region_short = shortRegion ?? '';
  finalResult.is_ephemeral = isEphemeral;

  // Validate that no null values exist in the final configuration
  validateNoNullValues(finalResult);

  if (output === 'flatten') {
    return flatten(finalResult, '', delimiter ?? '.');
  }
  return finalResult as MergedConfig;
}

function validateNoNullValues(obj: Record<string, ConfigValue>, path: string = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (value === null) {
      throw new Error(`Configuration contains null value at path: ${currentPath}. All required fields must have concrete values defined in the environment configuration.`);
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      validateNoNullValues(value as Record<string, ConfigValue>, currentPath);
    }
  }
}

function hasNullValues(obj: Record<string, ConfigValue>): boolean {
  for (const value of Object.values(obj)) {
    if (value === null) return true;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (hasNullValues(value as Record<string, ConfigValue>)) return true;
    }
  }
  return false;
}

function flatten(obj: Record<string, ConfigValue>, prefix: string = '', delimiter: string = '.'): FlattenedConfig {
  const result: FlattenedConfig = {};
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

// Default export for backward compatibility
export default mergeConfig;
