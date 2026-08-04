const { BrowserWindow } = require('electron');
const { preloadPath } = require('./paths');
const { devArguments } = require('./dev-flags');

let controlWindow = null;
let startupWindow = null;

function createControlWindow() {
    controlWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            devTools: true,
            additionalArguments: devArguments(),
        },
    });
    controlWindow.loadFile('control.html');
    controlWindow.on('closed', () => {
        controlWindow = null;
    });
}

function createStartupWindow() {
    startupWindow = new BrowserWindow({
        width: 700,
        height: 560,
        resizable: false,
        webPreferences: {
            preload: preloadPath,
            devTools: true,
            contextIsolation: true,
            additionalArguments: devArguments(),
        },
    });
    startupWindow.loadFile('startup.html');
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

function closeControlWindow() {
    if (controlWindow && !controlWindow.isDestroyed()) controlWindow.close();
}

module.exports = {
    createControlWindow,
    createStartupWindow,
    getControlWindow,
    closeStartupWindow,
    closeControlWindow,
};
