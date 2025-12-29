/**
 * Environment component availability result - used in 'list' output when requesting a specific component
 */
export interface ComponentEnvironmentsResult {
  component: string;
  environments: EnvironmentEnvLevelAvailability[];
}

/**
 * Extended environment result with all components info - used in 'list' output when no specific component is requested
 */
export interface EnvironmentsResult {
  environments: EnvironmentComponentsAvailability[];
}

/**
 * Environment validity for all components (when --component not specified)
 */
export interface EnvironmentComponentsAvailability {
  environment: string;
  valid: boolean; // Whether this environment has any valid components
  components: ComponentEnvLevelAvailability[];
}

/**
 * Component availability within an environment
 */
export interface EnvLevelAvailability {
  available: boolean; // Whether the component is available (anywhere) in the environment
  envLevel: ComponentValidity;
  regions?: RegionalComponentValidity[];
}

export interface EnvironmentEnvLevelAvailability extends EnvLevelAvailability {
  environment: string;
}

export interface ComponentEnvLevelAvailability extends EnvLevelAvailability {
  component: string;
}

/**
 * Component validity check result
 */
export interface ComponentValidity {
  valid: boolean;
  reason?: string;
  hasConfig?: boolean;
}

export interface RegionalComponentValidity extends ComponentValidity {
  region: string;
}

/**
 * Region validity for all components (when --component not specified)
 */
export interface RegionAllComponentsResult {
  region: string;
  valid: boolean;
}
