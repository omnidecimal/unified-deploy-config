/**
 * AWS Region short code (e.g., 'usw2', 'use1')
 */
export type RegionShortCode =
  | 'use1' | 'use2' | 'usw1' | 'usw2'
  | 'cac1' | 'euw1' | 'euw2' | 'euw3' | 'euc1' | 'eun1'
  | 'aps1' | 'apne1' | 'apne2' | 'apne3' | 'apse1' | 'apse2' | 'apse3' | 'ape1'
  | 'sae1';

/**
 * AWS Region full name (e.g., 'us-west-2', 'us-east-1')
 */
export type RegionFullName =
  | 'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2'
  | 'ca-central-1' | 'eu-west-1' | 'eu-west-2' | 'eu-west-3' | 'eu-central-1' | 'eu-north-1'
  | 'ap-south-1' | 'ap-northeast-1' | 'ap-northeast-2' | 'ap-northeast-3'
  | 'ap-southeast-1' | 'ap-southeast-2' | 'ap-southeast-3' | 'ap-east-1'
  | 'sa-east-1';

/**
 * Generic configuration value - primitives and nested objects
 */
export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | ConfigValue[]
  | { [key: string]: ConfigValue };

/**
 * Component configuration object
 */
export interface ComponentConfig {
  [key: string]: ConfigValue;
}

/**
 * Region-specific configuration
 */
export interface RegionConfig {
  [key: string]: ConfigValue | ComponentConfig;
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  accountId?: string;
  regions?: Record<string, RegionConfig>;
  [key: string]: ConfigValue | ComponentConfig | Record<string, RegionConfig> | undefined;
}

/**
 * Defaults configuration structure
 */
export interface DefaultsConfig {
  [componentName: string]: ComponentConfig;
}

/**
 * Full deployment configuration file structure
 */
export interface DeploymentConfig {
  defaults?: DefaultsConfig;
  environments?: Record<string, EnvironmentConfig>;
  accounts?: Record<string, EnvironmentConfig>;
}

/**
 * Parsed target result
 */
export interface ParsedTarget {
  env: string;
  region: RegionFullName | undefined;
}

/**
 * Options for mergeConfig function
 */
export interface MergeConfigOptions {
  /** Path to configuration file or parsed config object */
  configFile: string | DeploymentConfig;
  /** Environment name */
  env: string;
  /** Region code or name (optional) */
  region?: string;
  /** Output format: 'json' or 'flatten' */
  output?: 'json' | 'flatten';
  /** Delimiter for flattened output */
  delimiter?: string;
  /** Prefix for ephemeral branch names */
  ephemeralBranchPrefix?: string;
  /** Disable ephemeral branch validation */
  disableEphemeralBranchCheck?: boolean;
  /** Branch name for ephemeral environments */
  branchName?: string | null;
  /** Component to hoist to root level */
  component?: string | null;
}

/**
 * Merged configuration result with metadata
 */
export interface MergedConfig {
  env_name: string;
  env_config_name: string;
  region: string;
  region_short: string;
  is_ephemeral: boolean;
  [key: string]: ConfigValue;
}

/**
 * Flattened configuration result
 */
export interface FlattenedConfig {
  [key: string]: string | number | boolean | (string | number | boolean)[];
}

/**
 * Component validity check result
 */
export interface ComponentValidityResult {
  valid: boolean;
  reason?: string;
  hasConfig?: boolean;
}

/**
 * Region validity in component availability check
 */
export interface RegionValidityResult {
  region: string;
  regionShort: string;
  valid: boolean;
  hasConfig?: boolean;
  reason?: string;
}

/**
 * Environment component availability result
 */
export interface EnvironmentComponentResult {
  environment: string;
  valid: boolean;
  envLevel: ComponentValidityResult;
  regions?: RegionValidityResult[];
}

/**
 * Output format types
 */
export type OutputFormat = 'json' | 'flatten' | 'list';
