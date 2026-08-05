const fs = require('fs');
const { isDev } = require('./dev-flags');
const { devSessionFilePath } = require('./paths');
const { readJson, writeJson } = require('./json-store');

const DEV_SESSION_VERSION = 1;

function readDevSession() {
    if (!isDev) return null;
    const snapshot = readJson(devSessionFilePath, null);
    return (snapshot && snapshot.version === DEV_SESSION_VERSION) ? snapshot : null;
}

// Non-pretty JSON: this snapshot is large and saved on every debounced digest change.
function writeDevSession(snapshot) {
    try {
        writeJson(devSessionFilePath, snapshot, { pretty: false });
    } catch (e) {
        console.error('Failed to save dev session at ' + devSessionFilePath + ':', e.message);
    }
}

function clearDevSession() {
    try {
        fs.rmSync(devSessionFilePath, { force: true });
    } catch (e) {}
}

module.exports = { DEV_SESSION_VERSION, readDevSession, writeDevSession, clearDevSession };
