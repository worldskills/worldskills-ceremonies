const fs = require('fs');
const path = require('path');

function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error('Failed to parse JSON at ' + filePath + ':', e.message);
        return fallback;
    }
}

function writeJson(filePath, value, opts) {
    const pretty = !opts || opts.pretty !== false;
    const data = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    const tempPath = path.join(
        path.dirname(filePath),
        '.' + path.basename(filePath) + '.tmp-' + process.pid + '-' + Date.now()
    );
    try {
        fs.writeFileSync(tempPath, data);
        fs.renameSync(tempPath, filePath);
    } catch (error) {
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        } catch (_cleanupError) {
            /* best effort */
        }
        throw error;
    }
}

module.exports = { readJson, writeJson };
