/**
 * Full deployment configuration file structure
 */
export interface DeploymentConfig {
  defaults?: DefaultsConfig;
  environments?: Record<string, EnvironmentConfig>;
}

/**
 * Defaults configuration structure
 */
export interface DefaultsConfig {
  [componentName: string]: ComponentConfig;
}

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
 * Generic configuration value - primitives and nested objects
 */
export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | ConfigValue[]
  | { [key: string]: ConfigValue };
