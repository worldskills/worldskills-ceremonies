const { BrowserWindow } = require('electron');
const { baseWebPreferences } = require('./window-factory');

let controlWindow = null;
let startupWindow = null;

function createControlWindow() {
    controlWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        webPreferences: baseWebPreferences(),
    });
    controlWindow.loadFile('src/views/control.html');
    controlWindow.on('closed', () => {
        controlWindow = null;
    });
}

function createStartupWindow() {
    startupWindow = new BrowserWindow({
        width: 700,
        height: 560,
        resizable: false,
        webPreferences: baseWebPreferences(),
    });
    startupWindow.loadFile('src/views/startup.html');
    startupWindow.on('closed', () => {
        startupWindow = null;
    });
}

function getControlWindow() {
    return controlWindow;
}

function closeStartupWindow() {
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.close();
}

module.exports = {
    createControlWindow,
    createStartupWindow,
    getControlWindow,
    closeStartupWindow,
};
