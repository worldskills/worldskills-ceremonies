const path = require('path');
const { app } = require('electron');

const appRoot = path.join(__dirname, '..');
const preloadPath = path.join(appRoot, 'preload.js');
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'config.json');
const devSessionFilePath = path.join(userDataPath, 'dev-session.json');
const bundledTemplateDir = path.join(appRoot, 'screens');
const bundledImagesDir = path.join(appRoot, 'images');
const flagsDir = path.join(appRoot, 'data', 'flags');

console.log(userDataPath)

module.exports = {
    appRoot,
    preloadPath,
    userDataPath,
    configFilePath,
    devSessionFilePath,
    bundledTemplateDir,
    bundledImagesDir,
    flagsDir,
};
