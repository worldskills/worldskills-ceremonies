const { BrowserWindow, screen: electronScreen } = require('electron');
const { baseWebPreferences } = require('./window-factory');
const { centerOnDisplay, resolveTargetDisplay } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus } = require('./control-channel');
const { hasFrameWindowFor } = require('./frame-windows');
const { markWindow } = require('./ipc/sender-role');
const { FEED, FRAME_STATUS } = require('./constants');

let gridWindow = null;
let gridFrameIds = [];
let lastGridConfig = null;
let gridTargetDisplay = null;

function forceCloseGrid() {
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.__forceClose = true;
        gridWindow.close();
    }
}

function openGridWindow(config) {
    lastGridConfig = config;

    const frames = config.frames || [];
    const grid = config.grid || { cols: 2, gap: 0 };
    const frameSize = config.frameSize || { width: 1100, height: 500 };
    const gap = grid.gap || 0;

    // Close the previous grid window BEFORE reassigning state — its async 'closed' handler would otherwise null out state belonging to the new window.
    forceCloseGrid();
    gridWindow = null;
    gridFrameIds = [];

    // Explicit config.position.monitor targets that display; otherwise fall back to the primary display (pre-existing behavior).
    const target = config.position && config.position.monitor != null
        ? resolveTargetDisplay(config.position).display
        : electronScreen.getPrimaryDisplay();
    const wa = target.workArea;
    gridTargetDisplay = target;

    const centered = centerOnDisplay(target, wa.width, wa.height);

    // JSON blob, not delimiter-joined tokens, so a frame label can contain any character without colliding with the encoding.
    const framesPayload = frames.map(f => ({
        frameId: f.frameId,
        label: f.label || '',
        accent: f.accent || '',
        container: f.container || ''
    }));

    const win = new BrowserWindow({
        width: wa.width,
        height: wa.height,
        x: centered.x,
        y: centered.y,
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
            'frames=' + encodeURIComponent(JSON.stringify(framesPayload)),
            'cols=' + grid.cols,
            'cellW=' + frameSize.width,
            'cellH=' + frameSize.height,
            'gap=' + gap,
            'feed=' + (config.feed || FEED.LIVE),
        ].join('&')
    });

    // No 'ready-to-show' → show() here: the window stays hidden until fitGridWindow() has sized it
    // to the rendered grid, so it never flashes at work-area size first.

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
            if (!hasFrameWindowFor(fId)) notifyFrameStatus(fId, FRAME_STATUS.READY);
        });
        // Safety net: if the renderer never reports a size (crashed, or its preload API is missing),
        // show it anyway at work-area size. A wrong-sized grid beats an invisible one on show day.
        setTimeout(() => {
            if (gridWindow === win && !win.isDestroyed() && !win.isVisible()) win.show();
        }, 3000);
    });

    win.on('closed', () => {
        // Stale closure guard: if a newer grid window already replaced this one, this handler must not touch current state.
        if (gridWindow !== win) return;
        gridFrameIds.forEach(fId => {
            if (!hasFrameWindowFor(fId)) notifyFrameStatus(fId, FRAME_STATUS.CLOSED);
        });
        gridWindow = null;
        gridFrameIds = [];
        lastGridConfig = null;
        gridTargetDisplay = null;
    });

    return { ok: true };
}

// Called once by the grid renderer after the project's grid.html has rendered and been scaled to
// fit — it is the only side that knows how many cells the project actually laid out.
function fitGridWindow(sender, size) {
    if (!gridWindow || gridWindow.isDestroyed() || gridWindow.webContents !== sender) {
        return { ok: false, error: 'Not the grid window' };
    }
    const width = Math.max(320, Math.round(size && size.width) || 0);
    const height = Math.max(240, Math.round(size && size.height) || 0);

    if (Array.isArray(size && size.frameIds)) gridFrameIds = [...new Set(size.frameIds)];

    gridWindow.setContentSize(width, height);
    const target = gridTargetDisplay || electronScreen.getPrimaryDisplay();
    const centered = centerOnDisplay(target, width, height);
    gridWindow.setPosition(centered.x, centered.y);
    gridWindow.show();
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

module.exports = { openGridWindow, fitGridWindow, isGridOpen, getGridFrameIds, getLastGridConfig, forceCloseGrid };
