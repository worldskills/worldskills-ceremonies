const fs = require('fs');
const { sessionFilePath } = require('./paths');
const { readJson, writeJson } = require('./json-store');

const SESSION_VERSION = 2;

function readSession() {
    const snapshot = readJson(sessionFilePath, null);
    return (snapshot && snapshot.version === SESSION_VERSION) ? snapshot : null;
}

function writeSession(snapshot) {
    try {
        writeJson(sessionFilePath, snapshot, { pretty: false });
    } catch (e) {
        console.error('Failed to save session at ' + sessionFilePath + ':', e.message);
    }
}

function clearSession() {
    try {
        fs.rmSync(sessionFilePath, { force: true });
    } catch (e) {}
}

module.exports = { SESSION_VERSION, readSession, writeSession, clearSession };
