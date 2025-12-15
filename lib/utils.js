/**
 * Deep merge multiple objects. Later objects override earlier ones.
 * Arrays are not merged - they are replaced entirely.
 *
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged result
 */
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

/**
 * Find the first null value in an object, returning its dot-notation path.
 *
 * @param {Object} obj - Object to search
 * @param {string} path - Current path prefix (used for recursion)
 * @returns {string|null} Path to null value, or null if none found
 */
function findNullValue(obj, path = '') {
    for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (value === null) {
            return currentPath;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nullPath = findNullValue(value, currentPath);
            if (nullPath) return nullPath;
        }
    }
    return null;
}

module.exports = {
    deepMerge,
    findNullValue
};
