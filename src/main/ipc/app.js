const { ipcMain } = require('electron');
const appWindows = require('../app-windows');
const frameWindows = require('../frame-windows');

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
}

module.exports = { registerAppIpc };
