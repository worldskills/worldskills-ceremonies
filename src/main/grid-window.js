const { BrowserWindow, screen: electronScreen } = require('electron');
const { baseWebPreferences } = require('./window-factory');
const { clampToDisplayWorkArea, resolveTargetDisplay } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus } = require('./control-channel');
const { hasFrameWindowFor } = require('./frame-windows');
const { markWindow } = require('./ipc/sender-role');

let gridWindow = null;
let gridFrameIds = [];
let lastGridConfig = null;

function forceCloseGrid() {
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.__forceClose = true;
        gridWindow.close();
    }
}

function openGridWindow(config) {
    lastGridConfig = config;

    const frames = config.frames || [];
    const grid = config.grid || { cols: 2, rows: 1, gap: 0 };
    const frameSize = config.frameSize || { width: 1100, height: 500 };
    const gap = grid.gap || 0;

    // Close the previous grid window BEFORE reassigning state — its async 'closed' handler would otherwise null out state belonging to the new window.
    forceCloseGrid();
    gridWindow = null;
    gridFrameIds = [];

    const totalWidth  = grid.cols * frameSize.width  + (grid.cols - 1) * gap;
    const totalHeight = grid.rows * frameSize.height + (grid.rows - 1) * gap;

    // Explicit config.position.monitor targets that display; otherwise fall back to the primary display (pre-existing behavior).
    const target = config.position && config.position.monitor != null
        ? resolveTargetDisplay(config.position).display
        : electronScreen.getPrimaryDisplay();
    const wa = target.workArea;

    // Single scale factor for both axes, window sized to match exactly — independent per-axis clamping would leave dead space on the non-binding axis.
    const scale = Math.min(1, wa.width / totalWidth, wa.height / totalHeight);
    const winWidth = Math.round(totalWidth * scale);
    const winHeight = Math.round(totalHeight * scale);
    const clamped = clampToDisplayWorkArea(target, null, null, winWidth, winHeight);

    // JSON blob, not delimiter-joined tokens, so a frame label can contain any character without colliding with the encoding.
    const cellsPayload = frames.map(f => ({
        frameId: f.frameId,
        container: f.container || '',
        label: f.label || '',
        accent: f.accent || ''
    }));

    const win = new BrowserWindow({
        width: clamped.width,
        height: clamped.height,
        x: clamped.x,
        y: clamped.y,
        // Without this the title bar eats into the content area, drifting cell iframes off their configured size (see openFrameWindow).
        useContentSize: true,
        frame: true,
        show: false,
        backgroundColor: '#000',
        // Without nodeIntegrationInSubFrames, the preload's window.ceremonator only reaches frames.html itself, not its iframes — silently breaking screen.js's translation IPC in grid view.
        webPreferences: baseWebPreferences({ nodeIntegrationInSubFrames: true, backgroundThrottling: false, ceremonatorRole: 'output' }),
    });
    markWindow(win, 'output');
    // No always-on-top here (unlike live frame windows) — grid view never fullscreens, so pinning it would block reaching the control panel behind it.

    gridWindow = win;
    gridFrameIds = [...new Set(frames.map(f => f.frameId))];

    win.loadFile('src/views/frames.html', {
        search: [
            'cells=' + encodeURIComponent(JSON.stringify(cellsPayload)),
            'cols=' + grid.cols,
            'rows=' + grid.rows,
            'frameW=' + frameSize.width,
            'frameH=' + frameSize.height,
            'gap=' + gap,
            'scale=' + scale,
            'feed=' + (config.feed || 'live'),
        ].join('&')
    });

    win.once('ready-to-show', () => win.show());

    // Routes through the 'close' handler below for confirm-before-close, same as the title-bar button.
    attachCloseShortcuts(win, {});

    // Confirms on every close path (title bar, Cmd/Ctrl+W, Cmd+Q) now that the window has a real title bar; forceCloseGrid()'s win.__forceClose skips the dialog for the pre-emptive close above.
    win.on('close', (event) => {
        if (!confirmClose(win, {
            title: 'Close grid view?',
            message: 'This closes the grid view. Any frame with its own independent live window is unaffected.'
        })) {
            event.preventDefault();
        }
    });

    win.webContents.on('did-finish-load', () => {
        // Skip frames with their own live window — overwriting its status here would desync the operator panel.
        gridFrameIds.forEach(fId => {
            if (!hasFrameWindowFor(fId)) notifyFrameStatus(fId, 'ready');
        });
    });

    win.on('closed', () => {
        // Stale closure guard: if a newer grid window already replaced this one, this handler must not touch current state.
        if (gridWindow !== win) return;
        gridFrameIds.forEach(fId => {
            if (!hasFrameWindowFor(fId)) notifyFrameStatus(fId, 'closed');
        });
        gridWindow = null;
        gridFrameIds = [];
        lastGridConfig = null;
    });

    return { ok: true };
}

function isGridOpen() {
    return !!(gridWindow && !gridWindow.isDestroyed());
}

function getGridFrameIds() {
    return gridFrameIds.slice();
}

function getLastGridConfig() {
    return lastGridConfig;
}

module.exports = { openGridWindow, isGridOpen, getGridFrameIds, getLastGridConfig, forceCloseGrid };
