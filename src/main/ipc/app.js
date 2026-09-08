const { ipcMain } = require('electron');
const appWindows = require('../app-windows');
const frameWindows = require('../frame-windows');
const { sendControlDebug } = require('../control-channel');
const { hasRole } = require('./sender-role');

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

    ipcMain.on('app:debug', (event, data) => {
        if (!hasRole(event, ['output']) || !data) return;
        const allowed = ['video-failure', 'load-failure'];
        if (allowed.indexOf(data.type) < 0) return;
        sendControlDebug(data.type, String(data.message || '').slice(0, 500));
    });
}

module.exports = { registerAppIpc };
