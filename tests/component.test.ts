import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from '../src/lib/merge-config.js';
import type { FlattenedConfig, MergedConfig } from '../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('component functionality', () => {
  const DefaultTestConfigFile = path.join(__dirname, '..', 'test-cfg.json5');

  test('should handle component hoisting for tfState', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      component: 'tfState'
    }) as FlattenedConfig;

    // Should only have tfState values at root level plus metadata
    expect(result.bucketName).toBe('tf-state-bucket');
    expect(result.region).toBe('us-west-2');
    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.region_short).toBe('usw2');
    expect(result.is_ephemeral).toBe(false);

    // Should not have other components
    expect(result['network.vpc_cidr']).toBeUndefined();
    expect(result['tags.Project']).toBeUndefined();
    // accountId should be present as it's environment metadata
    expect(result.accountId).toBe('123456789012');
  });

  test('should handle component hoisting for network', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      component: 'network'
    }) as FlattenedConfig;

    // Should only have network values at root level plus metadata
    expect(result.vpc_cidr).toBe('10.1.0.0/21');
    expect(result.nat_instance_type).toBe('t4g.nano');
    expect(result.availability_zones).toEqual(['us-west-2a', 'us-west-2b', 'us-west-2c']);
    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.is_ephemeral).toBe(false);

    // Should not have other components
    expect(result['tfState.bucketName']).toBeUndefined();
    expect(result['tags.Project']).toBeUndefined();
    // accountId should be present as it's environment metadata
    expect(result.accountId).toBe('123456789012');
  });

  test('should throw error for invalid component', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        component: 'invalidComponent'
      });
    }).toThrow("Component 'invalidComponent' not found or is not a valid component in the merged configuration");
  });

  test('should work normally when component is not specified', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.'
      // component not specified
    }) as FlattenedConfig;

    // Should have all components flattened
    expect(result['tfState.bucketName']).toBe('tf-state-bucket');
    expect(result['network.vpc_cidr']).toBe('10.1.0.0/21');
    expect(result['tags.Project']).toBe('project-name');
    expect(result.accountId).toBe('123456789012');
  });

  test('should retain common metadata associated with environment and region', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      component: 'network'
    }) as FlattenedConfig;

    // Verify common metadata is retained
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.accountId).toBe('123456789012');
    expect(result.is_ephemeral).toBe(false);
  });

  test('hoist: false should return all components nested while validating component', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'json',
      component: 'network',
      hoist: false
    }) as MergedConfig;

    // Should have all components nested
    expect(result.network).toBeDefined();
    expect(result.tfState).toBeDefined();
    expect(result.tags).toBeDefined();

    // Should have network values nested under network key
    expect((result.network as Record<string, unknown>).vpc_cidr).toBe('10.1.0.0/21');

    // Should NOT have network values hoisted to root
    expect(result.vpc_cidr).toBeUndefined();

    // Metadata should still be present
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
  });

  test('hoist: false should still validate component exists', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        region: 'usw2',
        output: 'json',
        component: 'nonexistentComponent',
        hoist: false
      });
    }).toThrow("Component 'nonexistentComponent' not found or is not a valid component in the merged configuration");
  });

  test('hoist: false should still validate region requirement for non-region-agnostic components', () => {
    // When a component requires a region and none is provided, it should throw
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'dev',
        // no region specified
        output: 'json',
        component: 'network', // network is not region-agnostic
        hoist: false
      });
    }).toThrow(/must specify a region/);
  });

  test('default hoist should be true (backwards compatible)', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      component: 'network'
      // hoist not specified - should default to true
    }) as FlattenedConfig;

    // Should have network values at root level (hoisted behavior)
    expect(result.vpc_cidr).toBe('10.1.0.0/21');

    // Should not have nested component structure
    expect(result['network.vpc_cidr']).toBeUndefined();
  });

  test('hoist should have no effect when component is null', () => {
    const resultWithHoist = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'json',
      component: null,
      hoist: true
    }) as MergedConfig;

    const resultWithoutHoist = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'json',
      component: null,
      hoist: false
    }) as MergedConfig;

    // Both should have all components nested (same behavior)
    expect(resultWithHoist.network).toBeDefined();
    expect(resultWithHoist.tfState).toBeDefined();
    expect(resultWithoutHoist.network).toBeDefined();
    expect(resultWithoutHoist.tfState).toBeDefined();

    // Structure should be the same
    expect(JSON.stringify(resultWithHoist)).toBe(JSON.stringify(resultWithoutHoist));
  });

  test('hoist: true with component should hoist (explicit true)', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      component: 'network',
      hoist: true
    }) as FlattenedConfig;

    // Should have network values at root level
    expect(result.vpc_cidr).toBe('10.1.0.0/21');
    expect(result.nat_instance_type).toBe('t4g.nano');

    // Should not have other components
    expect(result['tfState.bucketName']).toBeUndefined();
  });

  test('hoist: false should throw error when requested component has null values', () => {
    // prod environment is empty, so network would have null values from defaults
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'prod',
        output: 'json',
        component: 'network',
        hoist: false
      });
    }).toThrow(/Component 'network' has incomplete configuration \(contains null values\)/);
  });
});
