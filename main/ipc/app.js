const { ipcMain } = require('electron');
const appWindows = require('../app-windows');
const frameWindows = require('../frame-windows');
const gridWindow = require('../grid-window');
const { clearDevSession } = require('../dev-session-store');

function registerAppIpc() {
    ipcMain.handle('app:openControl', () => {
        appWindows.createControlWindow();
        appWindows.closeStartupWindow();
        return { ok: true };
    });

    ipcMain.handle('app:reloadScreen', (_event, opts) => {
        const frameId = opts && opts.frameId;
        if (!frameId) return { ok: false };
        return frameWindows.reloadFrameWindow(frameId);
    });

    ipcMain.handle('app:exitToStartup', () => {
        // The operator already confirmed via the control panel's own confirm()
        // before invoking this — skip each window's 'close' handler dialog.
        frameWindows.forceCloseAllFrameWindows();
        // Leaving the project deliberately is a clean slate: don't let the next dev
        // launch resume back into it.
        clearDevSession();
        gridWindow.forceCloseGrid();
        appWindows.createStartupWindow();
        appWindows.closeControlWindow();
        return { ok: true };
    });
}

module.exports = { registerAppIpc };
