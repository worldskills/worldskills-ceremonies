const fs = require('fs');
const { isDev } = require('./dev-flags');
const { devSessionFilePath } = require('./paths');

const DEV_SESSION_VERSION = 1;

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
        fs.writeFileSync(devSessionFilePath, JSON.stringify(snapshot));
    } catch (e) {}
}

function clearDevSession() {
    try {
        fs.rmSync(devSessionFilePath, { force: true });
    } catch (e) {}
}

module.exports = { DEV_SESSION_VERSION, readDevSession, writeDevSession, clearDevSession };
