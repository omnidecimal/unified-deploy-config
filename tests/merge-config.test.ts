import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig, parseTarget } from '../src/lib/merge-config.js';
import type { DeploymentConfig, MergedConfig, FlattenedConfig } from '../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('mergeConfig function', () => {
  const DefaultTestConfigFile = path.join(__dirname, '..', 'test-cfg.json5');

  test('should correctly parse existing environment with regional overrides', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;

    // Verify specific values that should be present for dev/usw2
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.accountId).toBe('123456789012');
    expect(result.otherField).toBe('some-value');
    expect(result['tags.Project']).toBe('project-name');
    expect(result['tags.ManagedBy']).toBe('terraform');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
    expect(result['network.nat_instance_type']).toBe('t4g.nano');
    expect(result['network.availability_zones']).toEqual(['us-west-2a', 'us-west-2b', 'us-west-2c']);
    expect(result['network.public_subnet_cidrs']).toEqual(['10.1.0.0/24', '10.1.1.0/24', '10.1.2.0/24']);
    expect(result['network.private_subnet_cidrs']).toEqual(['10.1.4.0/24', '10.1.5.0/24', '10.1.6.0/24']);
  });

  test('should correctly parse ephemeral environment with proper values', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;

    // Verify ephemeral environment works with concrete values
    expect(result.env_name).toBe('ephemeral');
    expect(result.region).toBe('us-west-2');
    expect(result['tags.Project']).toBe('project-name');
    expect(result['tags.ManagedBy']).toBe('terraform');
    expect(result['tfState.bucketName']).toBe('tf-state-bucket');
    expect(result['tfState.region']).toBe('us-west-2');
    expect(result['network.vpc_cidr']).toBe('10.2.0.0/21');
    expect(result['network.required_network_val']).toBe('ephemeral-network-value');

    // These should be present due to regional overrides
    expect(result.accountId).toBe('999999999999');
    expect(result['network.nat_instance_type']).toBe('t4g.nano');
  });

  test('should use custom delimiter', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '_'
    }) as FlattenedConfig;

    // Verify custom delimiter is used
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result['tags_Project']).toBe('project-name');
    expect(result['tags_ManagedBy']).toBe('terraform');
    expect(result['network_vpc_cidr']).toBe('10.1.0.0/21');
    expect(result['network_nat_instance_type']).toBe('t4g.nano');

    // Verify dot-delimited keys don't exist
    expect(result['tags.Project']).toBeUndefined();
    expect(result['network.vpc_cidr']).toBeUndefined();
  });

  test('should return non-flattened object when output is not "flatten"', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'json',
      delimiter: '.'
    }) as MergedConfig;

    // Verify nested structure is preserved
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.accountId).toBe('123456789012');
    expect(result.tags).toEqual({
      Project: 'project-name',
      ManagedBy: 'terraform'
    });
    expect((result.network as Record<string, unknown>).vpc_cidr).toBe('10.1.0.0/21');
    expect((result.network as Record<string, unknown>).nat_instance_type).toBe('t4g.nano');

    // Verify flattened keys don't exist
    expect((result as unknown as FlattenedConfig)['tags.Project']).toBeUndefined();
    expect((result as unknown as FlattenedConfig)['network.vpc_cidr']).toBeUndefined();
  });

  test('should throw error for invalid environment', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: '',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Environment 'nonexistent' not found in config file");
  });

  test('should throw error for invalid region code', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'invalid-region',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Region 'invalid-region' is not a valid region code or name");
  });

  test('should not throw error if region is valid but does not exist in config file', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'us-east-1', // Valid region code but not in config
        output: 'flatten',
        delimiter: '.'
      });
    }).not.toThrow();

    // Should return environment defaults when region doesn't exist
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'use1',
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;

    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-east-1'); // Should convert short code to full name
    expect(result.region_short).toBe('use1');
    expect(result.accountId).toBe('123456789012'); // From environment config
    expect(result['network.vpc_cidr']).toBe('10.2.0.0/21'); // From environment config
  });

  test('should throw error for non-existent config file', () => {
    expect(() => {
      mergeConfig({
        configFile: './non-existent-file.json',
        env: 'dev',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow();
  });

  test('should throw error when environment has regions but no region is specified', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: '',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Environment 'dev' has regions defined. You must specify a region. Available regions: us-west-2");
  });

  test('should support short region codes and convert to full names', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',  // Short code
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;

    // Should convert short code to full region name
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');  // Full name
    expect(result.region_short).toBe('usw2');  // Short code
    expect(result.accountId).toBe('123456789012');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
  });

  test('should support full region names and derive short codes', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'us-west-2',  // Full name
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;

    // Should keep full region name and derive short code
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');  // Full name
    expect(result.region_short).toBe('usw2');  // Derived short code
    expect(result.accountId).toBe('123456789012');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
  });

  test('should produce consistent output for repeated calls', () => {
    const result1 = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    });

    const result2 = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    });

    expect(result1).toEqual(result2);
  });

  test('should allow empty region for environments without regions defined', () => {
    // prod environment has no regions defined, so empty region should work
    // Note: This test expects to fail on null validation, not on region validation
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'prod',
        region: '',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Configuration contains null value"); // prod fails on null validation, but passes region check
  });

  test('should ensure no undefined values in dev/usw2 output', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;

    // Ensure no undefined values in the output
    Object.values(result).forEach(value => {
      expect(value).not.toBeUndefined();
    });
  });

  // Tests for null validation feature
  test('should throw error for prod environment with null required_network_val', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'prod',
        region: '',
        output: 'flatten',
        delimiter: '.'
      });
    }).toThrow("Configuration contains null value at path: network.required_network_val. All required fields must have concrete values defined in the environment configuration.");
  });

  test('should not throw error for environments with concrete values', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.'
      });
    }).not.toThrow();

    // Verify the concrete value is present
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
    }) as FlattenedConfig;
    expect(result['network.required_network_val']).toBe('dev-network-value');
  });

  test('should validate null values in nested objects', () => {
    // Create a config with nested null values
    const configWithNestedNull: DeploymentConfig = {
      defaults: {
        deeply: {
          nested: {
            value: null
          }
        }
      },
      environments: {
        test: {}
      }
    };

    expect(() => {
      mergeConfig({
        configFile: configWithNestedNull,
        env: 'test',
        region: '',
        output: 'json'
      });
    }).toThrow("Configuration contains null value at path: deeply.nested.value. All required fields must have concrete values defined in the environment configuration.");
  });

  test('should allow null values if overridden by environment', () => {
    // Create a config where null in defaults is overridden
    const configWithOverride: DeploymentConfig = {
      defaults: {
        testValue: null
      },
      environments: {
        test: {
          testValue: "concrete-value"
        }
      }
    };

    expect(() => {
      mergeConfig({
        configFile: configWithOverride,
        env: 'test',
        region: '',
        output: 'json'
      });
    }).not.toThrow();

    const result = mergeConfig({
      configFile: configWithOverride,
      env: 'test',
      region: '',
      output: 'json'
    }) as MergedConfig;
    expect(result.testValue).toBe('concrete-value');
  });
});

describe('parseTarget function', () => {
  test('should parse target with short region code and return full region name', () => {
    const result = parseTarget('dev-usw2');
    expect(result.env).toBe('dev');
    expect(result.region).toBe('us-west-2');
  });

  test('should parse target with full region name', () => {
    const result = parseTarget('dev-us-west-2');
    expect(result.env).toBe('dev');
    expect(result.region).toBe('us-west-2');
  });

  test('should return undefined region when no region suffix present', () => {
    const result = parseTarget('production');
    expect(result.env).toBe('production');
    expect(result.region).toBeUndefined();
  });

  test('should handle various short region codes', () => {
    expect(parseTarget('staging-use1')).toEqual({ env: 'staging', region: 'us-east-1' });
    expect(parseTarget('staging-use2')).toEqual({ env: 'staging', region: 'us-east-2' });
    expect(parseTarget('staging-euw1')).toEqual({ env: 'staging', region: 'eu-west-1' });
    expect(parseTarget('staging-apne1')).toEqual({ env: 'staging', region: 'ap-northeast-1' });
    expect(parseTarget('staging-sae1')).toEqual({ env: 'staging', region: 'sa-east-1' });
  });

  test('should handle various full region names', () => {
    expect(parseTarget('staging-us-east-1')).toEqual({ env: 'staging', region: 'us-east-1' });
    expect(parseTarget('staging-us-east-2')).toEqual({ env: 'staging', region: 'us-east-2' });
    expect(parseTarget('staging-eu-west-1')).toEqual({ env: 'staging', region: 'eu-west-1' });
    expect(parseTarget('staging-ap-northeast-1')).toEqual({ env: 'staging', region: 'ap-northeast-1' });
    expect(parseTarget('staging-sa-east-1')).toEqual({ env: 'staging', region: 'sa-east-1' });
  });

  test('should handle environment names with hyphens', () => {
    const result = parseTarget('my-env-name-usw2');
    expect(result.env).toBe('my-env-name');
    expect(result.region).toBe('us-west-2');
  });

  test('should handle environment names with hyphens and full region name', () => {
    const result = parseTarget('my-env-name-us-west-2');
    expect(result.env).toBe('my-env-name');
    expect(result.region).toBe('us-west-2');
  });

  test('should not match partial region codes', () => {
    // 'usw' is not a valid region code, so entire string should be the env
    const result = parseTarget('test-usw');
    expect(result.env).toBe('test-usw');
    expect(result.region).toBeUndefined();
  });

  test('should handle simple environment names', () => {
    expect(parseTarget('dev')).toEqual({ env: 'dev', region: undefined });
    expect(parseTarget('staging')).toEqual({ env: 'staging', region: undefined });
    expect(parseTarget('production')).toEqual({ env: 'production', region: undefined });
  });
});
