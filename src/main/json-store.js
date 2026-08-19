const fs = require('fs');
const path = require('path');

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
    const data = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    const tempPath = path.join(path.dirname(filePath), '.' + path.basename(filePath) + '.tmp-' + process.pid + '-' + Date.now());
    try {
        fs.writeFileSync(tempPath, data);
        fs.renameSync(tempPath, filePath);
    } catch (error) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_cleanupError) { /* best effort */ }
        throw error;
    }
}

module.exports = { readJson, writeJson };
