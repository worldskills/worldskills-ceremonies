const path = require('path');
const { configFilePath } = require('./paths');
const { readJson, writeJson } = require('./json-store');

function readConfig() {
    return readJson(configFilePath, {});
}

function writeConfig(cfg) {
    try {
        writeJson(configFilePath, cfg);
        return { ok: true };
    } catch (e) {
        console.error('Failed to save config at ' + configFilePath + ' (recent projects will not persist):', e.message);
        return { ok: false, error: e.message };
    }
}

function addRecent(dir, name) {
    const cfg = readConfig();
    const recent = cfg.recentProjects || [];
    const filtered = recent.filter(function (r) { return r.path !== dir; });
    filtered.unshift({ path: dir, name: name || path.basename(dir), lastOpened: new Date().toISOString() });
    cfg.recentProjects = filtered.slice(0, 8);
    cfg.lastProject = dir;
    writeConfig(cfg);
}

module.exports = { readConfig, writeConfig, addRecent };
