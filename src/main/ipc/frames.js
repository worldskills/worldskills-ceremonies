const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { flagsDir, bundledTemplateDir } = require('../paths');
const { getActiveTemplateDir } = require('../project-store');
const frameWindows = require('../frame-windows');
const gridWindow = require('../grid-window');
const { listDisplays } = require('../display-geometry');
const { hasRole } = require('./sender-role');

const CONTAINER_RE = /^[a-z][a-z0-9_-]*$/i;

function registerFrameIpc() {
    ipcMain.handle('frames:openWindow', (event, opts) => {
        if (!hasRole(event, ['control'])) return { ok: false, error: 'Forbidden sender' };
        const frameId = opts && opts.frameId;
        if (!frameId || !/^[a-z][a-z0-9_-]*$/i.test(frameId)) return { ok: false, error: 'Valid frameId required' };
        const size = opts && opts.size;
        if (size && (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 320 || size.height < 240 || size.width > 7680 || size.height > 4320)) {
            return { ok: false, error: 'Invalid output dimensions' };
        }
        if (opts.container && !CONTAINER_RE.test(opts.container)) return { ok: false, error: 'Invalid output container' };
        frameWindows.openFrameWindow(frameId, opts);
        return { ok: true };
    });

    ipcMain.handle('frames:closeWindow', (event, opts) => {
        if (!hasRole(event, ['control'])) {
            return { ok: false, error: 'Forbidden sender' };
        }

        const frameId = opts && opts.frameId;
        if (frameId) frameWindows.closeFrameWindow(frameId);

        return { ok: true };
    });

    ipcMain.handle('frames:openLarge', (event, config) => {
        if(hasRole(event, ['control'])) {
            gridWindow.openGridWindow(config)
        } else {
            return { ok: false, error: 'Forbidden sender' };
        }
    });

    ipcMain.handle('grid:template', () => {
        const roots = [getActiveTemplateDir(), bundledTemplateDir];
        for (const root of roots) {
            if (!root) continue;
            try {
                return fs.readFileSync(path.join(root, 'grid.html'), 'utf8');
            } catch (_error) { /* try fallback */ }
        }
        return '';
    });

    ipcMain.handle('grid:fit', (event, size) => gridWindow.fitGridWindow(event.sender, size));

    ipcMain.handle('frames:getPositions', () => frameWindows.getFrameWindowPositions());

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
