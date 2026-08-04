const { ipcMain } = require('electron');
const fs = require('fs');
const { flagsDir } = require('../paths');
const frameWindows = require('../frame-windows');
const gridWindow = require('../grid-window');
const { listDisplays } = require('../display-geometry');

function registerFrameIpc() {
    ipcMain.handle('frames:openWindow', (_event, opts) => {
        const frameId = opts && opts.frameId;
        if (!frameId) return { ok: false, error: 'frameId required' };
        frameWindows.openFrameWindow(frameId, opts);
        return { ok: true };
    });

    ipcMain.handle('frames:closeWindow', (_event, opts) => {
        const frameId = opts && opts.frameId;
        if (frameId) frameWindows.closeFrameWindow(frameId);
        return { ok: true };
    });

    ipcMain.handle('frames:openLarge', (_event, config) => gridWindow.openGridWindow(config));

    ipcMain.handle('frames:getPositions', () => frameWindows.getFrameWindowPositions());

    // Which frames currently have an open window. Lets a renderer that started
    // *after* the windows did (the dev-restart path) reconcile its status badges,
    // since those windows' 'connecting'/'ready' notices arrived too early to land.
    ipcMain.handle('frames:openIds', () => {
        const ids = frameWindows.getOpenFrameIds();
        if (gridWindow.isGridOpen()) {
            gridWindow.getGridFrameIds().forEach((frameId) => {
                if (ids.indexOf(frameId) < 0) ids.push(frameId);
            });
        }
        return ids;
    });

    ipcMain.handle('flags:list', () => {
        try {
            return fs.readdirSync(flagsDir)
                .filter((f) => /\.png$/i.test(f))
                .map((f) => f.replace(/\.png$/i, ''));
        } catch (e) {
            return [];
        }
    });

    ipcMain.handle('displays:list', () => listDisplays());
}

module.exports = { registerFrameIpc };
