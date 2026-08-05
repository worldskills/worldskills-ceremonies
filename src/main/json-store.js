const fs = require('fs');

// Logs and still returns fallback on a corrupt file, so it's distinguishable from "not created yet" only in the log, not the return value.
function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error('Failed to parse JSON at ' + filePath + ':', e.message);
        return fallback;
    }
}

// Throws on failure by design — callers that want a non-throwing write wrap it themselves.
function writeJson(filePath, value, opts) {
    const pretty = !opts || opts.pretty !== false;
    fs.writeFileSync(filePath, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

module.exports = { readJson, writeJson };
