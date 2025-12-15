const { deepMerge, findNullValue } = require('./utils');

/**
 * Check where a component has valid configuration across environments and regions.
 *
 * @param {Object} config - The parsed configuration object
 * @param {string} componentName - The component name to check
 * @returns {Array} Array of environment results with validity status
 */
function checkComponentAvailability(config, componentName) {
    const envSource = config.accounts || config.environments;

    if (!envSource) {
        return [];
    }

    const results = [];

    for (const envName of Object.keys(envSource)) {
        const envConfig = envSource[envName];
        const regions = envConfig.regions ? Object.keys(envConfig.regions) : [];

        // Check environment level (no region)
        const envResult = checkComponentValidity(config, envSource, envName, null, componentName);

        // Check each region
        const regionResults = [];
        for (const region of regions) {
            const regionResult = checkComponentValidity(config, envSource, envName, region, componentName);
            if (regionResult.valid) {
                regionResults.push({ region, valid: true, hasConfig: regionResult.hasConfig });
            } else {
                regionResults.push({ region, valid: false, reason: regionResult.reason });
            }
        }

        // Environment is valid if env-level is valid OR any region is valid
        const anyRegionValid = regionResults.some(r => r.valid);
        const isValid = envResult.valid || anyRegionValid;

        results.push({
            environment: envName,
            valid: isValid,
            envLevel: envResult.valid
                ? { valid: true, hasConfig: envResult.hasConfig }
                : { valid: false, reason: envResult.reason },
            regions: regionResults.length > 0 ? regionResults : undefined
        });
    }

    return results;
}

/**
 * Check if a component has valid configuration for a specific environment/region.
 *
 * @param {Object} config - The parsed configuration object
 * @param {Object} envSource - The environments or accounts object
 * @param {string} envName - Environment name
 * @param {string|null} region - Region name (null for env-level check)
 * @param {string} componentName - Component name to check
 * @returns {Object} Validity result with valid, reason, and hasConfig fields
 */
function checkComponentValidity(config, envSource, envName, region, componentName) {
    const defaults = config.defaults || {};
    const envConfig = envSource[envName] || {};
    const regionConfig = region ? (envConfig.regions?.[region] || {}) : {};

    // Get component config at each level
    const defaultComp = defaults[componentName];
    const envComp = envConfig[componentName];
    const regionComp = regionConfig[componentName];

    // Component must exist at some level
    if (!defaultComp && !envComp && !regionComp) {
        return { valid: false, reason: 'component_not_found' };
    }

    // Deep merge the component configs
    const merged = deepMerge(defaultComp || {}, envComp || {}, regionComp || {});

    // Check for null values
    const nullPath = findNullValue(merged);
    if (nullPath) {
        return { valid: false, reason: `null_value_at_${nullPath}` };
    }

    // Check if there's explicit config at this level (env or region)
    const hasConfig = region
        ? Boolean(regionComp && Object.keys(regionComp).length > 0)
        : Boolean(envComp && Object.keys(envComp).length > 0);

    return { valid: true, hasConfig };
}

module.exports = {
    checkComponentAvailability,
    checkComponentValidity
};
