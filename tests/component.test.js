const mergeConfig = require('../lib/merge-config');
const path = require('path');

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
    });

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
    });

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
    });

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
    });

    // Verify common metadata is retained
    expect(result.env_name).toBe('dev');
    expect(result.region).toBe('us-west-2');
    expect(result.region_short).toBe('usw2');
    expect(result.accountId).toBe('123456789012');
    expect(result.is_ephemeral).toBe(false);
  });

});
