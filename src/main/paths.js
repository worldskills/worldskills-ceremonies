const path = require('path');
const { app } = require('electron');

// src/main/ is two levels below the app root (<root>/src/main).
const appRoot = path.join(__dirname, '..', '..');
const preloadPath = path.join(appRoot, 'preload.js');

if (!app.isPackaged) {
    app.setPath('userData', app.getPath('userData') + '-dev');
}
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'config.json');
const devSessionFilePath = path.join(userDataPath, 'dev-session.json');
const projectsRootDir = path.join(appRoot, 'projects');
const bareProjectDir = path.join(projectsRootDir, 'bare-project');
const bundledTemplateDir = path.join(bareProjectDir, 'template');
const bundledDataDir = path.join(bareProjectDir, 'data');
const flagsDir = path.join(bundledDataDir, 'flags');

function projectFilePath(dir) { return path.join(dir, 'project.json'); }
function orderingFilePath(dir) { return path.join(dir, 'ordering.json'); }
function templateDirPath(dir) { return path.join(dir, 'template'); }
function translationsFilePath(dir) { return path.join(dir, 'translations.json'); }
function projectDataDir(dir) { return path.join(dir, 'data'); }

module.exports = {
    appRoot,
    preloadPath,
    userDataPath,
    configFilePath,
    devSessionFilePath,
    projectsRootDir,
    bareProjectDir,
    bundledTemplateDir,
    bundledDataDir,
    flagsDir,
    projectFilePath,
    orderingFilePath,
    templateDirPath,
    translationsFilePath,
    projectDataDir,
};
