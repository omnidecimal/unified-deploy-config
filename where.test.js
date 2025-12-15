const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

describe('where command', () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'where-test-'));
    });

    afterEach(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    function createConfig(config) {
        const configFile = path.join(tempDir, 'config.json5');
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
        return configFile;
    }

    function runWhere(configFile, component, outputFormat = 'json') {
        const result = execSync(
            `node cli.js where --config "${configFile}" --component ${component} --output ${outputFormat}`,
            { encoding: 'utf8' }
        );
        return outputFormat === 'json' ? JSON.parse(result) : result.trim().split('\n');
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                environment: 'dev',
                valid: true,
                envLevel: { valid: true, hasConfig: false }  // only in defaults
            });
            expect(result[1]).toMatchObject({
                environment: 'prod',
                valid: true,
                envLevel: { valid: true, hasConfig: false }
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result).toHaveLength(2);
            expect(result.find(r => r.environment === 'dev')).toMatchObject({
                environment: 'dev',
                valid: false,
                envLevel: { valid: false, reason: 'null_value_at_setting1' }
            });
            expect(result.find(r => r.environment === 'prod')).toMatchObject({
                environment: 'prod',
                valid: true,
                envLevel: { valid: true, hasConfig: true }  // has env-specific config
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                environment: 'dev',
                valid: true,  // true because region is valid
                envLevel: { valid: false, reason: 'null_value_at_setting1' }
            });
            expect(result[0].regions).toEqual([
                { region: 'us-west-2', valid: true, hasConfig: true }
            ]);
        });

        test('should show component not found', () => {
            const configFile = createConfig({
                defaults: {},
                environments: {
                    dev: {}
                }
            });

            const result = runWhere(configFile, 'nonexistent');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                environment: 'dev',
                valid: false,
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result[0]).toMatchObject({
                environment: 'dev',
                valid: false,
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result[0]).toMatchObject({
                environment: 'dev',
                valid: true,
                envLevel: { valid: true, hasConfig: false }  // no env-level config
            });
            expect(result[0].regions).toEqual([
                { region: 'us-west-2', valid: true, hasConfig: true },   // has region config
                { region: 'us-east-1', valid: true, hasConfig: false }   // no region config
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result[0]).toMatchObject({
                environment: 'dev',
                valid: true,  // env level is still valid
                envLevel: { valid: true, hasConfig: false }
            });
            expect(result[0].regions).toEqual([
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

            const result = runWhere(configFile, 'mycomponent', 'list');

            expect(result).toContain('dev');
            expect(result).toContain('dev/us-west-2');
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

            const result = runWhere(configFile, 'mycomponent', 'list');

            expect(result).not.toContain('dev');  // env-level invalid
            expect(result).toContain('dev/us-west-2');  // region valid
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

            const result = execSync(
                `node cli.js where --config "${configFile}" --component mycomponent --output list`,
                { encoding: 'utf8' }
            );

            expect(result.trim()).toBe('');
        });
    });

    describe('edge cases', () => {
        test('should work with accounts instead of environments', () => {
            const configFile = createConfig({
                defaults: {
                    mycomponent: { setting1: 'default' }
                },
                accounts: {
                    dev: {},
                    prod: {}
                }
            });

            const result = runWhere(configFile, 'mycomponent');

            expect(result).toHaveLength(2);
            expect(result.every(r => r.valid)).toBe(true);
        });

        test('should handle empty environments gracefully', () => {
            const configFile = createConfig({
                defaults: {
                    mycomponent: { setting1: 'default' }
                },
                environments: {}
            });

            const result = runWhere(configFile, 'mycomponent');

            expect(result).toHaveLength(0);
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result.find(r => r.environment === 'dev')).toMatchObject({
                valid: true,
                envLevel: { valid: true, hasConfig: true }
            });
            expect(result.find(r => r.environment === 'prod')).toMatchObject({
                valid: false,
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

            const result = runWhere(configFile, 'mycomponent');

            expect(result.find(r => r.environment === 'dev')).toMatchObject({
                envLevel: { valid: true, hasConfig: true }
            });
            expect(result.find(r => r.environment === 'prod')).toMatchObject({
                envLevel: { valid: true, hasConfig: false }
            });
        });
    });
});
