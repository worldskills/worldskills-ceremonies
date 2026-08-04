const fs = require('fs');
const path = require('path');
const { configFilePath } = require('./paths');

function readConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function writeConfig(cfg) {
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(cfg, null, 2));
    } catch (e) {}
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
