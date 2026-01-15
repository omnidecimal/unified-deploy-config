import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvironmentsResult, EnvironmentsResult } from '../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('list-environments command', () => {
  const cliPath = path.join(__dirname, '..', 'dist', 'esm', 'cli.js');
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'list-environments-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createConfig(config: object): string {
    const configFile = path.join(tempDir, 'config.json5');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
    return configFile;
  }

  function runListEnvironments(
    configFile: string,
    component?: string,
    outputFormat: 'json' | 'list' = 'json'
  ): ComponentEnvironmentsResult | EnvironmentsResult | string[] {
    const componentArg = component ? `--component ${component}` : '';
    const result = execSync(
      `node ${cliPath} list-environments --config "${configFile}" ${componentArg} --output ${outputFormat}`,
      { encoding: 'utf8' }
    );
    if (outputFormat === 'list') {
      const lines = result.trim().split('\n');
      return lines[0] === '' ? [] : lines;
    }
    return JSON.parse(result);
  }

  describe('JSON output', () => {
    test('should find component valid at environment level', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: 'default-value' }
        },
        environments: {
          dev: {},
          prod: {}
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.component).toBe('mycomponent');
      expect(result.environments).toHaveLength(2);
      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true,
        envLevel: { valid: true, hasConfig: false, target: 'dev' }
      });
      expect(result.environments[1]).toMatchObject({
        environment: 'prod',
        available: true,
        envLevel: { valid: true, hasConfig: false, target: 'prod' }
      });
    });

    test('should detect null values making component invalid', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: null }
        },
        environments: {
          dev: {},
          prod: {
            mycomponent: { setting1: 'prod-value' }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments).toHaveLength(2);
      expect(result.environments.find(r => r.environment === 'dev')).toMatchObject({
        environment: 'dev',
        available: false,
        envLevel: { valid: false, reason: 'null_value_at_setting1' }
      });
      expect(result.environments.find(r => r.environment === 'prod')).toMatchObject({
        environment: 'prod',
        available: true,
        envLevel: { valid: true, hasConfig: true, target: 'prod' }  // has env-specific config
      });
    });

    test('should find component valid only at region level', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: null }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {
                mycomponent: { setting1: 'region-value' }
              }
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments).toHaveLength(1);
      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true,  // true because region is valid
        envLevel: { valid: false, reason: 'null_value_at_setting1' }
      });
      expect(result.environments[0]!.regions).toEqual([
        { region: 'us-west-2', valid: true, hasConfig: true, target: 'dev-usw2' }
      ]);
    });

    test('should show component not found', () => {
      const configFile = createConfig({
        defaults: {},
        environments: {
          dev: {}
        }
      });

      const result = runListEnvironments(configFile, 'nonexistent') as ComponentEnvironmentsResult;

      expect(result.environments).toHaveLength(1);
      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: false,
        envLevel: { valid: false, reason: 'component_not_found' }
      });
    });

    test('should detect nested null values', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: {
            nested: {
              deep: {
                value: null
              }
            }
          }
        },
        environments: {
          dev: {}
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: false,
        envLevel: { valid: false, reason: 'null_value_at_nested.deep.value' }
      });
    });

    test('should handle mixed env and region validity', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: 'default' }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {
                mycomponent: { setting2: 'region-only' }
              },
              'us-east-1': {}
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true,
        envLevel: { valid: true, hasConfig: false, target: 'dev' }  // no env-level config
      });
      expect(result.environments[0]!.regions).toEqual([
        { region: 'us-west-2', valid: true, hasConfig: true, target: 'dev-usw2' },   // has region config
        { region: 'us-east-1', valid: true, hasConfig: false, target: 'dev-use1' }   // no region config
      ]);
    });

    test('should handle region with null value when env is valid', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: 'default' }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {
                mycomponent: { setting1: null }  // overrides with null
              }
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true,  // env level is still valid
        envLevel: { valid: true, hasConfig: false, target: 'dev' }
      });
      expect(result.environments[0]!.regions).toEqual([
        { region: 'us-west-2', valid: false, reason: 'null_value_at_setting1' }
      ]);
    });
  });

  describe('list output', () => {
    test('should list only valid environments and regions', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: null }
        },
        environments: {
          dev: {
            mycomponent: { setting1: 'dev-value' },
            regions: {
              'us-west-2': {}
            }
          },
          prod: {}  // invalid - null not overridden
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent', 'list') as string[];

      expect(result).toContain('dev');
      expect(result).toContain('dev-usw2');
      expect(result).not.toContain('prod');
    });

    test('should only show region when env-level is invalid', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: null }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {
                mycomponent: { setting1: 'region-value' }
              }
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent', 'list') as string[];

      expect(result).not.toContain('dev');  // env-level invalid
      expect(result).toContain('dev-usw2');  // region valid
    });

    test('should return empty for completely invalid component', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: null }
        },
        environments: {
          dev: {},
          prod: {}
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent', 'list') as string[];

      expect(result).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    test('should handle empty environments gracefully', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: 'default' }
        },
        environments: {}
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments).toHaveLength(0);
    });

    test('should handle component only defined at env level (not in defaults)', () => {
      const configFile = createConfig({
        defaults: {},
        environments: {
          dev: {
            mycomponent: { setting1: 'dev-only' }
          },
          prod: {}
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments.find(r => r.environment === 'dev')).toMatchObject({
        available: true,
        envLevel: { valid: true, hasConfig: true, target: 'dev' }
      });
      expect(result.environments.find(r => r.environment === 'prod')).toMatchObject({
        available: false,
        envLevel: { valid: false, reason: 'component_not_found' }
      });
    });

    test('should show hasConfig correctly for defaults-only vs env-specific config', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: 'default' }
        },
        environments: {
          dev: {
            mycomponent: { setting2: 'env-specific' }  // adds to defaults
          },
          prod: {}  // inherits defaults only
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments.find(r => r.environment === 'dev')).toMatchObject({
        envLevel: { valid: true, hasConfig: true, target: 'dev' }
      });
      expect(result.environments.find(r => r.environment === 'prod')).toMatchObject({
        envLevel: { valid: true, hasConfig: false, target: 'prod' }
      });
    });
  });

  describe('without --component (all components)', () => {
    test('should show all environments where any component is valid', () => {
      const configFile = createConfig({
        defaults: {
          componentA: { setting1: 'default-a' },
          componentB: { setting1: null }
        },
        environments: {
          dev: {
            componentB: { setting1: 'dev-b' }
          },
          prod: {}
        }
      });

      const result = runListEnvironments(configFile) as EnvironmentsResult;

      expect(result.environments).toHaveLength(2);

      // dev: both components valid
      const devResult = result.environments.find(r => r.environment === 'dev');
      expect(devResult?.valid).toBe(true);
      expect(devResult?.components.find(c => c.component === 'componentA')?.available).toBe(true);
      expect(devResult?.components.find(c => c.component === 'componentB')?.available).toBe(true);

      // prod: only componentA valid
      const prodResult = result.environments.find(r => r.environment === 'prod');
      expect(prodResult?.valid).toBe(true);
      expect(prodResult?.components.find(c => c.component === 'componentA')?.available).toBe(true);
      expect(prodResult?.components.find(c => c.component === 'componentB')?.available).toBe(false);
    });

    test('should output list of valid targets for any component', () => {
      const configFile = createConfig({
        defaults: {
          componentA: { setting1: 'default' }
        },
        environments: {
          dev: {},
          prod: {}
        }
      });

      const result = runListEnvironments(configFile, undefined, 'list') as string[];

      expect(result).toContain('dev');
      expect(result).toContain('prod');
    });

    test('should handle environment with no valid components', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: null }
        },
        environments: {
          dev: {},
          prod: {
            mycomponent: { setting1: 'value' }
          }
        }
      });

      const result = runListEnvironments(configFile, undefined, 'list') as string[];

      expect(result).not.toContain('dev');
      expect(result).toContain('prod');
    });

    test('should aggregate region validity across components', () => {
      const configFile = createConfig({
        defaults: {
          componentA: { setting1: null },
          componentB: { setting1: 'default' }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {
                componentA: { setting1: 'region-value' }
              }
            }
          }
        }
      });

      const result = runListEnvironments(configFile) as EnvironmentsResult;

      expect(result.environments).toHaveLength(1);
      const devResult = result.environments[0];
      expect(devResult?.environment).toBe('dev');
      expect(devResult?.valid).toBe(true);
      expect(devResult?.components.find(c => c.component === 'componentA')?.available).toBe(true);
      expect(devResult?.components.find(c => c.component === 'componentB')?.available).toBe(true);
    });

    test('should return empty for config with no components', () => {
      const configFile = createConfig({
        defaults: {},
        environments: {
          dev: {},
          prod: {}
        }
      });

      const result = runListEnvironments(configFile) as EnvironmentsResult;

      expect(result.environments).toHaveLength(0);
    });
  });

  describe('region-agnostic components', () => {
    test('should only show env-level targets for region-agnostic component', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: {
            _regionAgnostic: true,
            setting1: 'default'
          }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {},
              'us-east-1': {}
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments).toHaveLength(1);
      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true,
        envLevel: { valid: true, hasConfig: false, target: 'dev' },
        regionAgnostic: true
      });
      // No regions should be present for region-agnostic components
      expect(result.environments[0]!.regions).toBeUndefined();
    });

    test('should still show regions for non-region-agnostic component', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: { setting1: 'default' }  // no _regionAgnostic
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {}
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true
      });
      expect(result.environments[0]!.regions).toEqual([
        { region: 'us-west-2', valid: true, hasConfig: false, target: 'dev-usw2' }
      ]);
      expect(result.environments[0]!.regionAgnostic).toBeUndefined();
    });

    test('region-agnostic in list output should only show env-level targets', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: {
            _regionAgnostic: true,
            setting1: 'default'
          }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {},
              'us-east-1': {}
            }
          },
          prod: {}
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent', 'list') as string[];

      expect(result).toContain('dev');
      expect(result).toContain('prod');
      // No region targets should appear
      expect(result).not.toContain('dev-usw2');
      expect(result).not.toContain('dev-use1');
    });

    test('env-level _regionAgnostic: false should override defaults', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: {
            _regionAgnostic: true,
            setting1: 'default'
          }
        },
        environments: {
          dev: {
            mycomponent: { _regionAgnostic: false },  // override
            regions: {
              'us-west-2': {}
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: true
      });
      // Since env overrides to false, regions should appear
      expect(result.environments[0]!.regions).toEqual([
        { region: 'us-west-2', valid: true, hasConfig: false, target: 'dev-usw2' }
      ]);
      expect(result.environments[0]!.regionAgnostic).toBeUndefined();
    });

    test('region-agnostic env invalid should still mark environment unavailable', () => {
      const configFile = createConfig({
        defaults: {
          mycomponent: {
            _regionAgnostic: true,
            setting1: null  // makes it invalid
          }
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {}  // normally would be checked but skipped for region-agnostic
            }
          }
        }
      });

      const result = runListEnvironments(configFile, 'mycomponent') as ComponentEnvironmentsResult;

      expect(result.environments[0]).toMatchObject({
        environment: 'dev',
        available: false,  // env-level is invalid
        envLevel: { valid: false, reason: 'null_value_at_setting1' },
        regionAgnostic: true
      });
    });

    test('all-components output should include regionAgnostic flag per component', () => {
      const configFile = createConfig({
        defaults: {
          componentA: {
            _regionAgnostic: true,
            setting1: 'default'
          },
          componentB: { setting1: 'default' }  // not region-agnostic
        },
        environments: {
          dev: {
            regions: {
              'us-west-2': {}
            }
          }
        }
      });

      const result = runListEnvironments(configFile) as EnvironmentsResult;

      const devResult = result.environments.find(r => r.environment === 'dev');
      const compA = devResult?.components.find(c => c.component === 'componentA');
      const compB = devResult?.components.find(c => c.component === 'componentB');

      expect(compA?.regionAgnostic).toBe(true);
      expect(compA?.regions).toBeUndefined();  // no regions for region-agnostic

      expect(compB?.regionAgnostic).toBeUndefined();
      expect(compB?.regions).toBeDefined();  // has regions for normal component
    });
  });

});
