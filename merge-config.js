#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

// Region mapping: short code -> full name
const AwsRegionMapping = {
    'use1': 'us-east-1',
    'use2': 'us-east-2',
    'usw1': 'us-west-1',
    'usw2': 'us-west-2',
    'cac1': 'ca-central-1',
    'euw1': 'eu-west-1',
    'euw2': 'eu-west-2',
    'euw3': 'eu-west-3',
    'euc1': 'eu-central-1',
    'eun1': 'eu-north-1',
    'aps1': 'ap-south-1',
    'apne1': 'ap-northeast-1',
    'apne2': 'ap-northeast-2',
    'apne3': 'ap-northeast-3',
    'apse1': 'ap-southeast-1',
    'apse2': 'ap-southeast-2',
    'apse3': 'ap-southeast-3',
    'ape1': 'ap-east-1',
    'sae1': 'sa-east-1'
};

function mergeConfig({ configFile, env, region, output, delimiter, ephemeralBranchPrefix, disableEphemeralBranchCheck, branchName, component }) {
    const config = typeof configFile === 'string'
        ? JSON5.parse(fs.readFileSync(path.resolve(configFile), 'utf8'))
        : configFile;

    const envSource = config.accounts || config.environments;

    // Handle ephemeral environments
    let { envName, envConfigName, isEphemeral } = determineEnvironment();

    // Convert region to full name if it's a short code
    const fullRegion = region ? (AwsRegionMapping[region] || region) : region;
    const shortRegion = region ? (Object.keys(AwsRegionMapping).find(key => AwsRegionMapping[key] === fullRegion) || region) : region;

    // Validate environment exists (using envConfigName to support ephemeral cases)
    if (!envSource || !envSource[envConfigName]) {
        throw new Error(`Environment '${envConfigName}' not found in config file`);
    }

    // Validate region exists in mapping if provided (can use either full region name or short code)
    if (region && !AwsRegionMapping[region] && !Object.values(AwsRegionMapping).includes(region)) {
        throw new Error(`Region '${region}' is not a valid region code or name`);
    }

    function determineEnvironment() {
        let envName = env;
        let envConfigName = env;
        let isEphemeral = false;

        // If a direct match for the env is found in the config, we can return early, unless it's 'ephemeral'.
        if (env !== 'ephemeral' && envSource && envSource[env]) {
            return { envName, envConfigName, isEphemeral: false };
        }

        // From here, we are either dealing with an explicit 'ephemeral' env or an env not found in the config.
        // Both cases might be ephemeral environments.

        if (env === 'ephemeral' && envSource && envSource[env]) {
            envConfigName = 'ephemeral';
            isEphemeral = true;
        }

        if (!ephemeralBranchPrefix || ephemeralBranchPrefix.trim() === '') {
            // Ephemeral logic is disabled, and we already checked for direct matches.
            if (!isEphemeral) {
                throw new Error(`Environment '${env}' not found in config file`);
            }
        } else if (disableEphemeralBranchCheck) {
            // Trust that this is an ephemeral environment without checking the branch name.
            isEphemeral = true;
            envConfigName = 'ephemeral';
            // Note: envName remains as the input 'env' since we can't derive it from a branch.
        } else if (branchName) {
            const ephemeralPattern = new RegExp(`^${ephemeralBranchPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9_-]+$`);

            if (ephemeralPattern.test(branchName)) {
                const branchEnvName = branchName.substring(ephemeralBranchPrefix.length);

                // If env was specified (and not 'ephemeral'), it must match the branch-derived name.
                if (env !== 'ephemeral' && env !== branchEnvName && env !== branchName) {
                    throw new Error(`Ephemeral environment name '${env}' does not match the branch name '${branchName}'`);
                }

                isEphemeral = true;
                envName = branchEnvName;
                envConfigName = 'ephemeral';
            } else {
                // Branch name is present but does not match the ephemeral pattern.
                throw new Error(`Ephemeral environment branches must follow the format '${ephemeralBranchPrefix}<name>' where <name> contains only lowercase letters, numbers, hyphens, and underscores. Current branch: ${branchName}`);
            }
        } else if (env === 'ephemeral') {
            // If env is 'ephemeral' but we have no branch name to derive the real name from,
            // we'll proceed with 'ephemeral' as the envName.
            isEphemeral = true;
            envName = 'ephemeral';
            envConfigName = 'ephemeral';
        }

        if (isEphemeral) {
            return { envName, envConfigName, isEphemeral };
        }

        // If we've reached here, it means it wasn't a direct match and didn't qualify as an ephemeral environment.
        throw new Error(`Environment '${env}' not found in config file`);
    }

    function deepMerge(...objects) {
        const result = {};
        for (const obj of objects) {
            if (!obj || typeof obj !== 'object') continue;
            for (const key of Object.keys(obj)) {
                if (
                    obj[key] &&
                    typeof obj[key] === 'object' &&
                    !Array.isArray(obj[key]) &&
                    result[key] &&
                    typeof result[key] === 'object' &&
                    !Array.isArray(result[key])
                ) {
                    result[key] = deepMerge(result[key], obj[key]);
                } else {
                    result[key] = obj[key];
                }
            }
        }
        return result;
    }

    function getMergedComponentConfig(componentName) {
        const defaultComp = config.defaults?.[componentName] || {};
        const envComp = envSource?.[envConfigName]?.[componentName] || {};
        const regionComp = fullRegion
            ? envSource?.[envConfigName]?.regions?.[fullRegion]?.[componentName] || {}
            : {};
        return deepMerge(defaultComp, envComp, regionComp);
    }

    function getAllComponentKeys() {
        const keys = new Set();
        function isComponent(configObj, key) {
            const value = configObj[key];
            return value && typeof value === 'object' && !Array.isArray(value);
        }

        if (config.defaults) {
            Object.keys(config.defaults).filter(k => isComponent(config.defaults, k)).forEach(k => keys.add(k));
        }
        if (envSource?.[envConfigName]) {
            Object.keys(envSource[envConfigName]).filter(k => isComponent(envSource[envConfigName], k) && k !== 'regions').forEach(k => keys.add(k));
            if (fullRegion && envSource[envConfigName].regions?.[fullRegion]) {
                Object.keys(envSource[envConfigName].regions[fullRegion]).filter(k => isComponent(envSource[envConfigName].regions[fullRegion], k)).forEach(k => keys.add(k));
            }
        }
        return Array.from(keys);
    }

    function getGlobalMerged() {
        function isNonComponent([k, v]) {
            return typeof v !== 'object' || v === null || Array.isArray(v);
        }
        const d = Object.fromEntries(Object.entries(config.defaults || {}).filter(isNonComponent));
        const e = Object.fromEntries(Object.entries(envSource?.[envConfigName] || {}).filter(isNonComponent));
        const r = fullRegion
            ? Object.fromEntries(Object.entries(envSource?.[envConfigName]?.regions?.[fullRegion] || {}).filter(isNonComponent))
            : {};
        return deepMerge(d, e, r);
    }

    const merged = {
        ...getGlobalMerged(),
        ...Object.fromEntries(getAllComponentKeys().map(k => [k, getMergedComponentConfig(k)])),
    };

    // Handle component hoisting if specified
    let finalResult = merged;
    if (component) {
        // Check if the component exists in the merged config
        if (merged[component] && typeof merged[component] === 'object' && !Array.isArray(merged[component])) {
            // Get non-component properties to preserve
            const nonComponentProps = getGlobalMerged();

            // Hoist the specified component to root level while preserving non-component metadata
            finalResult = {
                ...nonComponentProps,
                ...merged[component],
            };
        } else {
            throw new Error(`Component '${component}' not found or is not a valid component in the merged configuration`);
        }
    }

    // Add common dynamic metadata to the merged result (environment, region, etc)
    finalResult.env_name = envName;
    finalResult.env_config_name = envConfigName;
    finalResult.region = fullRegion || '';
    finalResult.region_short = shortRegion || '';
    finalResult.is_ephemeral = isEphemeral;

    // Validate that no null values exist in the final configuration
    validateNoNullValues(finalResult);

    if (output === 'flatten') {
        return flatten(finalResult, '', delimiter || '.');
    }
    return finalResult;
}

function validateNoNullValues(obj, path = '') {
    for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (value === null) {
            throw new Error(`Configuration contains null value at path: ${currentPath}. All required fields must have concrete values defined in the environment configuration.`);
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            validateNoNullValues(value, currentPath);
        }
    }
}

function flatten(obj, prefix = '', delimiter = '.') {
    let result = {};
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}${delimiter}${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(result, flatten(v, key, delimiter));
        } else {
            result[key] = v;
        }
    }
    return result;
}


if (require.main === module) {
    // CLI: --config <path> --env <env> [--region <region>] [--output json|flatten] [--delimiter <char>] [--terraform] [--ephemeral-branch-prefix <prefix>] [--disable-ephemeral-branch-check] [--branch-name <name>] [--debug]
    const args = process.argv.slice(2);
    let configFile, env, region, output = 'json', delimiter = '.', tfMode = false, ephemeralBranchPrefix, disableEphemeralBranchCheck = false, branchName, component, debugMode = false;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--config':
                configFile = args[++i];
                break;
            case '--env':
                env = args[++i];
                break;
            case '--region':
                region = args[++i];
                break;
            case '--output':
                output = args[++i].toLowerCase();
                if (!['json', 'flatten'].includes(output)) {
                    console.error(`Invalid value for --output: ${output}. Must be 'json' or 'flatten'.`);
                    process.exit(1);
                }
                break;
            case '--delimiter':
                delimiter = args[++i];
                break;
            case '--terraform':
                tfMode = true;
                break;
            case '--ephemeral-branch-prefix':
                ephemeralBranchPrefix = args[++i];
                break;
            case '--disable-ephemeral-branch-check':
                disableEphemeralBranchCheck = true;
                break;
            case '--branch-name':
                branchName = args[++i];
                break;
            case '--component':
                component = args[++i];
                break;
            case '--debug':
                debugMode = true;
                break;
            default:
                console.error(`Unrecognized argument: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!configFile || !env) {
        console.error('Usage: merge-config.js --config <configFile> --env <env> [--region <region>] [--output json|flatten] [--delimiter <char>] [--terraform] [--ephemeral-branch-prefix <prefix>] [--branch-name <name>] [--debug]');
        process.exit(1);
    }

    const result = mergeConfig({ configFile, env, region, output, delimiter, ephemeralBranchPrefix, disableEphemeralBranchCheck, branchName, component });

    if (tfMode) {
        // If debug mode is enabled, output human-readable config to stderr for visibility
        if (debugMode) {
            console.error('=== DEBUG: Merged Configuration ===');
            console.error(JSON.stringify(result, null, 2));
            console.error('=== END DEBUG ===');

            // Write to a debug file in /tmp with random suffix for easier viewing when called from Terraform
            try {
                const timestamp = Date.now();
                const randomSuffix = Math.random().toString(36).substring(2, 8);
                const debugFile = path.join('/tmp', `merge-config-debug-${timestamp}-${randomSuffix}.json`);
                fs.writeFileSync(debugFile, JSON.stringify(result, null, 2));
                console.error(`=== DEBUG: Debug file written to ${debugFile} ===`);
            } catch (e) {
                console.error(`=== DEBUG: Could not write debug file: ${e.message} ===`);
            }
        }

        // For Terraform, output as { "mergedConfig": <object> }
        // Terraform needs the mergedConfig value to be a string, which it will then parse as JSON
        console.log(JSON.stringify({ mergedConfig: JSON.stringify(result) }));

    } else {
        // Pretty JSON to stdout
        console.log(JSON.stringify(result, null, 2));
    }
}
module.exports = mergeConfig;
