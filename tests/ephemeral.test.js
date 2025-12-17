const mergeConfig = require('../lib/merge-config');
const path = require('path');

describe('ephemeral environment functionality', () => {
  const DefaultTestConfigFile = path.join(__dirname, '..', 'test-cfg.json5');

  test('should return normal environment when ephemeral prefix is not specified', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: undefined,
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should return normal environment when ephemeral prefix is empty', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: '',
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should return normal environment when ephemeral prefix is only whitespace', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: '   ',
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should return normal environment when known environment exists even if branch name matches ephemeral prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'dev',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-branch'
    });

    expect(result.env_name).toBe('dev');
    expect(result.env_config_name).toBe('dev');
    expect(result.is_ephemeral).toBe(false);
  });

  test('should throw error if input unprefixed ephemeral env does not match branchName', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'nonexistent',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    })).toThrow("Ephemeral environment name 'nonexistent' does not match the branch name 'ephemeral/test-feature'");
  });

  test('should throw error if input prefixed ephemeral env prefix does not match branchName', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'feature/test-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    })).toThrow("Ephemeral environment name 'feature/test-feature' does not match the branch name 'ephemeral/test-feature'");
  });

  test('should throw error if input prefixed ephemeral env suffix does not match branchName', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral/other-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    })).toThrow("Ephemeral environment name 'ephemeral/other-feature' does not match the branch name 'ephemeral/test-feature'");
  });

  test('should handle ephemeral environment with valid branch name matching input env without prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'test-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    });

    expect(result.env_name).toBe('test-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
    expect(result.accountId).toBe('999999999999');
  });

  test('should handle ephemeral environment with valid branch name matching input env with prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral/test-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/test-feature'
    });

    expect(result.env_name).toBe('test-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
    expect(result.accountId).toBe('999999999999');
  });

  test('should handle ephemeral environment with complex branch name', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'feature-123-test',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/feature-123-test'
    });

    expect(result.env_name).toBe('feature-123-test');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should handle custom ephemeral prefix', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'my-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'preview/',
      branchName: 'preview/my-feature'
    });

    expect(result.env_name).toBe('my-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should throw error when environment not found and no branch name', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: undefined
      });
    }).toThrow("Environment 'nonexistent' not found in config file");
  });

  test('should throw error when environment not found and branch name is null', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: null
      });
    }).toThrow("Environment 'nonexistent' not found in config file");
  });

  test('should throw error when branch name does not match ephemeral pattern', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: 'main'
      });
    }).toThrow("Ephemeral environment branches must follow the format 'ephemeral/<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: main");
  });

  test('should handle ephemeral environment with underscores in branch name', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'feature_with_underscores',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/feature_with_underscores'
    });

    expect(result.env_name).toBe('feature_with_underscores');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should throw error when branch name has uppercase characters', () => {
    expect(() => {
      mergeConfig({
        configFile: DefaultTestConfigFile,
        env: 'nonexistent',
        region: 'usw2',
        output: 'flatten',
        delimiter: '.',
        ephemeralBranchPrefix: 'ephemeral/',
        branchName: 'ephemeral/FeatureTest'
      });
    }).toThrow("Ephemeral environment branches must follow the format 'ephemeral/<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: ephemeral/FeatureTest");
  });

  test('should handle prefix with special regex characters', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'test-branch',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'preview.',
      branchName: 'preview.test-branch'
    });

    expect(result.env_name).toBe('test-branch');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should handle prefix with multiple special characters', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'my-feature',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'test[branch]/',
      branchName: 'test[branch]/my-feature'
    });

    expect(result.env_name).toBe('my-feature');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should handle env="ephemeral" and derive env_name from branchName', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral',
      region: 'usw2',
      output: 'flatten',
      delimiter: '.',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/my-test-branch'
    });

    expect(result.env_name).toBe('my-test-branch');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
    expect(result.accountId).toBe('999999999999');
  });

  test('should use existing "ephemeral" config when env="ephemeral"', () => {
    const customConfig = {
      environments: {
        ephemeral: {
          accountId: 'ephemeral-acct-id',
          some_other_key: 'some_value'
        }
      }
    };

    const result = mergeConfig({
      configFile: customConfig,
      env: 'ephemeral',
      region: 'usw2',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'ephemeral/my-branch'
    });

    expect(result.env_name).toBe('my-branch');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
    expect(result.accountId).toBe('ephemeral-acct-id');
    expect(result.some_other_key).toBe('some_value');
  });

  test('should set env_name to "ephemeral" when env is "ephemeral" and branchName is missing', () => {
    const result = mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral',
      region: 'usw2',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: undefined
    });

    expect(result.env_name).toBe('ephemeral');
    expect(result.env_config_name).toBe('ephemeral');
    expect(result.is_ephemeral).toBe(true);
  });

  test('should throw error if env="ephemeral" and branchName does not match pattern', () => {
    expect(() => mergeConfig({
      configFile: DefaultTestConfigFile,
      env: 'ephemeral',
      region: 'usw2',
      ephemeralBranchPrefix: 'ephemeral/',
      branchName: 'invalid-branch'
    })).toThrow("Ephemeral environment branches must follow the format 'ephemeral/<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: invalid-branch");
  });

});
