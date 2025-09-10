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
module.exports = flatten;
