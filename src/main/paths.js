const path = require('path');
const { app } = require('electron');

// src/main/ is two levels below the app root (<root>/src/main).
const appRoot = path.join(__dirname, '..', '..');
const preloadPath = path.join(appRoot, 'preload.js');

// A dev run (electron-forge start) and a packaged install share package.json's `name`, so without
// this they'd also share one userData folder — a dev session's config.json/dev-session.json could
// leak into (or get clobbered by) a real installed copy on the same machine. Must run before
// anything below reads userData, and before app 'ready'.
if (!app.isPackaged) {
    app.setPath('userData', app.getPath('userData') + '-dev');
}
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'config.json');
const devSessionFilePath = path.join(userDataPath, 'dev-session.json');
const projectsRootDir = path.join(appRoot, 'projects');
const bareProjectDir = path.join(projectsRootDir, 'bare-project');
// projects/bare-project is the shared, source-controlled seed for new projects — its
// template/ already contains html+css+fonts+images, and its data/ the trimmed skills/members/flags.
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
