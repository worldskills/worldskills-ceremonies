const fs = require('fs');
const { isDev } = require('./dev-flags');
const { devSessionFilePath } = require('./paths');

const DEV_SESSION_VERSION = 1;

// electron-reloader reloads every renderer on a file change (and restarts the
// app outright when main.js or preload.js changes), which throws away the
// imported results and the assembled slide catalog — they live only in the
// control renderer's memory. This snapshot lets both sides come back.

function readDevSession() {
    if (!isDev) return null;
    try {
        if (fs.existsSync(devSessionFilePath)) {
            const snapshot = JSON.parse(fs.readFileSync(devSessionFilePath, 'utf8'));
            if (snapshot && snapshot.version === DEV_SESSION_VERSION) return snapshot;
        }
    } catch (e) {}
    return null;
}

function writeDevSession(snapshot) {
    try {
        // Not pretty-printed: the raw imported result rows make this file large
        // and it is rewritten on every debounced change.
        fs.writeFileSync(devSessionFilePath, JSON.stringify(snapshot));
    } catch (e) {}
}

function clearDevSession() {
    try {
        fs.rmSync(devSessionFilePath, { force: true });
    } catch (e) {}
}

module.exports = { DEV_SESSION_VERSION, readDevSession, writeDevSession, clearDevSession };
