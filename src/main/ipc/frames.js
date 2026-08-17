const { ipcMain } = require('electron');
const fs = require('fs');
const { flagsDir } = require('../paths');
const frameWindows = require('../frame-windows');
const gridWindow = require('../grid-window');
const { listDisplays } = require('../display-geometry');
const { hasRole } = require('./sender-role');

function registerFrameIpc() {
    ipcMain.handle('frames:openWindow', (event, opts) => {
        if (!hasRole(event, ['control'])) return { ok: false, error: 'Forbidden sender' };
        const frameId = opts && opts.frameId;
        if (!frameId || !/^[a-z][a-z0-9_-]*$/i.test(frameId)) return { ok: false, error: 'Valid frameId required' };
        const size = opts && opts.size;
        if (size && (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 320 || size.height < 240 || size.width > 7680 || size.height > 4320)) {
            return { ok: false, error: 'Invalid output dimensions' };
        }
        if (opts.container && ['kv', 'state'].indexOf(opts.container) < 0) return { ok: false, error: 'Invalid output container' };
        frameWindows.openFrameWindow(frameId, opts);
        return { ok: true };
    });

    ipcMain.handle('frames:closeWindow', (event, opts) => {
        if (!hasRole(event, ['control'])) return { ok: false, error: 'Forbidden sender' };
        const frameId = opts && opts.frameId;
        if (frameId) frameWindows.closeFrameWindow(frameId);
        return { ok: true };
    });

    ipcMain.handle('frames:openLarge', (event, config) => hasRole(event, ['control']) ? gridWindow.openGridWindow(config) : { ok: false, error: 'Forbidden sender' });

    ipcMain.handle('frames:getPositions', () => frameWindows.getFrameWindowPositions());

    // Pull-based reconciliation for renderers that start after the windows did (dev-restart) and missed the earlier 'connecting'/'ready' push notices.
    ipcMain.handle('frames:openIds', () => {
        const ids = frameWindows.getOpenFrameIds();
        const counts = frameWindows.getOpenFrameCounts();
        if (gridWindow.isGridOpen()) {
            gridWindow.getGridFrameIds().forEach((frameId) => {
                if (ids.indexOf(frameId) < 0) ids.push(frameId);
            });
        }
        return { ids, counts };
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
