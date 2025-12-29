import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface RunResult {
  success: boolean;
  stderr?: string;
  stdout?: string;
}

describe('resolve command', () => {
  const cliPath = path.join(__dirname, '..', 'dist', 'esm', 'cli.js');
  const testConfigPath = path.join(__dirname, '..', 'test-cfg.json5');

  function runResolve(args: string): string {
    return execSync(`node ${cliPath} resolve ${args}`, { encoding: 'utf8' });
  }

  function runResolveWithError(args: string): RunResult {
    try {
      execSync(`node ${cliPath} resolve ${args}`, { encoding: 'utf8', stdio: 'pipe' });
      return { success: true };
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string };
      return { success: false, stderr: err.stderr, stdout: err.stdout };
    }
  }

  describe('--env and --region arguments', () => {
    test('should resolve config with --env and --region', () => {
      const result = runResolve(`--config ${testConfigPath} --env dev --region usw2`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('dev');
      expect(parsed.region).toBe('us-west-2');
      expect(parsed.region_short).toBe('usw2');
      expect(parsed.accountId).toBe('123456789012');
    });

    test('should handle --env without --region when env has no regions', () => {
      // prod has no regions and invalid components are filtered out
      const result = runResolve(`--config ${testConfigPath} --env prod`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('prod');
      // network is filtered out (has null values), but tfState and tags remain
      expect(parsed.network).toBeUndefined();
      expect(parsed.tfState).toBeDefined();
      expect(parsed.tags).toBeDefined();
    });

    test('should require --region when env has regions defined', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --env dev`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('has regions defined');
      expect(result.stderr).toContain('us-west-2');
    });

    test('should error when neither --target nor --env is specified', () => {
      const result = runResolveWithError(`--config ${testConfigPath}`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Either --target or --env must be specified');
    });
  });

  describe('--target argument', () => {
    test('should resolve config with --target containing region', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('dev');
      expect(parsed.region).toBe('us-west-2');
      expect(parsed.region_short).toBe('usw2');
      expect(parsed.accountId).toBe('123456789012');
    });

    test('should resolve config with --target without region', () => {
      // prod has no regions and invalid components are filtered out
      const result = runResolve(`--config ${testConfigPath} --target prod`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('prod');
      // network is filtered out (has null values), but tfState and tags remain
      expect(parsed.network).toBeUndefined();
      expect(parsed.tfState).toBeDefined();
      expect(parsed.tags).toBeDefined();
    });

    test('should error when --target env has regions but no region in target', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --target dev`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('has regions defined');
    });

    test('should error when --target is used with --env', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --target dev-usw2 --env dev`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('--target cannot be used with --env or --region');
    });

    test('should error when --target is used with --region', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --target dev-usw2 --region usw2`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('--target cannot be used with --env or --region');
    });

    test('should parse various region short codes correctly', () => {
      // Test with ephemeral which also has usw2
      const result = runResolve(`--config ${testConfigPath} --target ephemeral-usw2`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('ephemeral');
      expect(parsed.region).toBe('us-west-2');
      expect(parsed.region_short).toBe('usw2');
    });

    test('should handle target with hyphenated environment name', () => {
      // Create a temp config with hyphenated env name
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
      const tempConfig = path.join(tempDir, 'config.json5');
      fs.writeFileSync(tempConfig, JSON.stringify({
        environments: {
          'my-test-env': {
            accountId: '111111111111',
            regions: {
              'us-west-2': {}
            }
          }
        }
      }));

      try {
        const result = runResolve(`--config ${tempConfig} --target my-test-env-usw2`);
        const parsed = JSON.parse(result);
        expect(parsed.env_name).toBe('my-test-env');
        expect(parsed.region).toBe('us-west-2');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('--output format', () => {
    test('should output JSON by default', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('dev');
      expect(parsed.network).toBeDefined();
      expect(parsed.network.vpc_cidr).toBe('10.1.0.0/21');
    });

    test('should output flattened format with --output flatten', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2 --output flatten`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('dev');
      expect(parsed['network.vpc_cidr']).toBe('10.1.0.0/21');
      expect(parsed.network).toBeUndefined();
    });

    test('should use custom delimiter with --delimiter', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2 --output flatten --delimiter _`);
      const parsed = JSON.parse(result);

      expect(parsed['network_vpc_cidr']).toBe('10.1.0.0/21');
      expect(parsed['network.vpc_cidr']).toBeUndefined();
    });
  });

  describe('--terraform mode', () => {
    test('should wrap output for Terraform consumption', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2 --output flatten --terraform`);
      const parsed = JSON.parse(result.trim());

      expect(parsed).toHaveProperty('mergedConfig');
      expect(typeof parsed.mergedConfig).toBe('string');

      const innerConfig = JSON.parse(parsed.mergedConfig);
      expect(innerConfig.env_name).toBe('dev');
      expect(innerConfig.region).toBe('us-west-2');
      expect(innerConfig.region_short).toBe('usw2');
      expect(innerConfig.accountId).toBe('123456789012');
      expect(innerConfig['network.vpc_cidr']).toBe('10.1.0.0/21');
    });

    test('should output without terraform wrapper by default', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2 --output flatten`);
      const parsed = JSON.parse(result.trim());

      expect(parsed.env_name).toBe('dev');
      expect(parsed).not.toHaveProperty('mergedConfig');
    });
  });

  describe('--component argument', () => {
    test('should hoist component to root level', () => {
      const result = runResolve(`--config ${testConfigPath} --target dev-usw2 --component network`);
      const parsed = JSON.parse(result);

      expect(parsed.vpc_cidr).toBe('10.1.0.0/21');
      expect(parsed.nat_instance_type).toBe('t4g.nano');
      expect(parsed.env_name).toBe('dev');
      expect(parsed.network).toBeUndefined();
    });

    test('should error for invalid component', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --target dev-usw2 --component invalid`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('ephemeral environments', () => {
    test('should resolve ephemeral environment with --target', () => {
      const result = runResolve(`--config ${testConfigPath} --target ephemeral-usw2`);
      const parsed = JSON.parse(result);

      expect(parsed.env_name).toBe('ephemeral');
      expect(parsed.is_ephemeral).toBe(true);
      expect(parsed.accountId).toBe('999999999999');
    });
  });

  describe('error handling', () => {
    test('should error for non-existent config file', () => {
      const result = runResolveWithError(`--config /nonexistent/config.json5 --target dev-usw2`);
      expect(result.success).toBe(false);
    });

    test('should error for non-existent environment', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --target nonexistent-usw2`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('not found');
    });

    test('should error for invalid region code', () => {
      const result = runResolveWithError(`--config ${testConfigPath} --env dev --region invalid-region`);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('not a valid region');
    });
  });
});
