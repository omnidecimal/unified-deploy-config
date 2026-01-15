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
 * Reserved metadata keys that are stripped from output.
 * These keys start with underscore and control configuration behavior.
 */
export const COMPONENT_METADATA_KEYS = ['_regionAgnostic'] as const;
export type ComponentMetadataKey = (typeof COMPONENT_METADATA_KEYS)[number];

/**
 * Component configuration object.
 * Keys starting with underscore (e.g., _regionAgnostic) are metadata
 * that affects configuration behavior but is stripped from output.
 */
export interface ComponentConfig {
  /** If true, this component is region-agnostic and list-environments will only show env-level targets */
  _regionAgnostic?: boolean;
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
  | undefined
  | ConfigValue[]
  | { [key: string]: ConfigValue };
