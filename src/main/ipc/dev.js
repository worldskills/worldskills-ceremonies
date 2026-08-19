const { ipcMain } = require('electron');
const { SESSION_VERSION, readSession, writeSession, clearSession } = require('../session-store');
const { getActiveProjectDir } = require('../project-store');
const frameWindows = require('../frame-windows');
const gridWindow = require('../grid-window');

function registerDevIpc() {
    ipcMain.handle('dev:saveSession', (_event, control) => {
        writeSession({
            version: SESSION_VERSION,
            savedAt: new Date().toISOString(),
            projectDir: getActiveProjectDir(),
            control: control || null,
            windows: frameWindows.serializeOpenFrameWindows(),
            grid: gridWindow.isGridOpen() ? gridWindow.getLastGridConfig() : null
        });
        return { ok: true };
    });

    ipcMain.handle('dev:loadSession', () => {
        const snapshot = readSession();
        if (!snapshot) return null;
        const activeProjectDir = getActiveProjectDir();
        if (!activeProjectDir || snapshot.projectDir !== activeProjectDir) return null;
        return snapshot.control || null;
    });

    ipcMain.handle('dev:clearSession', () => {
        clearSession();
        return { ok: true };
    });
}

module.exports = { registerDevIpc };
