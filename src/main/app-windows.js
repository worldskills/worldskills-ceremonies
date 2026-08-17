const { BrowserWindow, dialog } = require('electron');
const { baseWebPreferences } = require('./window-factory');
const { markWindow } = require('./ipc/sender-role');

let controlWindow = null;
let startupWindow = null;

function createControlWindow() {
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.show();
        controlWindow.focus();
        return controlWindow;
    }
    controlWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        webPreferences: baseWebPreferences({ ceremonatorRole: 'control' }),
    });
    markWindow(controlWindow, 'control');
    controlWindow.loadFile('src/views/control.html');
    controlWindow.on('close', (event) => {
        // Lazy imports avoid the app-windows -> frame-windows -> control-channel cycle.
        const frameWindows = require('./frame-windows');
        const gridWindow = require('./grid-window');
        const counts = frameWindows.getOpenFrameCounts();
        const liveCount = Object.values(counts).reduce((sum, entry) => sum + entry.live, 0);
        const previewCount = Object.values(counts).reduce((sum, entry) => sum + entry.preview, 0);
        if (liveCount || previewCount || gridWindow.isGridOpen()) {
            event.preventDefault();
            dialog.showMessageBox(controlWindow, {
                type: 'warning',
                title: 'Outputs are still open',
                message: 'Close the audience outputs before closing Control.',
                detail: liveCount + ' Live, ' + previewCount + ' Preview, grid ' + (gridWindow.isGridOpen() ? 'open' : 'closed') + '.'
            });
        }
    });
    controlWindow.on('closed', () => {
        controlWindow = null;
    });
    return controlWindow;
}

function createStartupWindow() {
    startupWindow = new BrowserWindow({
        width: 700,
        height: 560,
        resizable: false,
        webPreferences: baseWebPreferences({ ceremonatorRole: 'startup' }),
    });
    markWindow(startupWindow, 'startup');
    startupWindow.loadFile('src/views/startup.html');
    startupWindow.on('closed', () => {
        startupWindow = null;
    });
}

function getControlWindow() {
    return controlWindow;
}

function hasControlWindow() {
    return !!(controlWindow && !controlWindow.isDestroyed());
}

function closeStartupWindow() {
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.close();
}

module.exports = {
    createControlWindow,
    createStartupWindow,
    getControlWindow,
    hasControlWindow,
    closeStartupWindow,
};
