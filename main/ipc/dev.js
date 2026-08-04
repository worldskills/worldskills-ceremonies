const { ipcMain } = require('electron');
const { isDev } = require('../dev-flags');
const { DEV_SESSION_VERSION, readDevSession, writeDevSession, clearDevSession } = require('../dev-session-store');
const { getActiveProjectDir } = require('../project-store');
const frameWindows = require('../frame-windows');
const gridWindow = require('../grid-window');

function registerDevIpc() {
    ipcMain.handle('dev:saveSession', (_event, control) => {
        if (!isDev) return { ok: false };
        writeDevSession({
            version: DEV_SESSION_VERSION,
            savedAt: new Date().toISOString(),
            projectDir: getActiveProjectDir(),
            control: control || null,
            windows: frameWindows.serializeOpenFrameWindows(),
            grid: gridWindow.isGridOpen() ? gridWindow.getLastGridConfig() : null
        });
        return { ok: true };
    });

    ipcMain.handle('dev:loadSession', () => {
        if (!isDev) return null;
        const snapshot = readDevSession();
        if (!snapshot) return null;
        // A snapshot only means anything for the project it was taken in.
        const activeProjectDir = getActiveProjectDir();
        if (!activeProjectDir || snapshot.projectDir !== activeProjectDir) return null;
        return snapshot.control || null;
    });

    ipcMain.handle('dev:clearSession', () => {
        clearDevSession();
        return { ok: true };
    });
}

module.exports = { registerDevIpc };
