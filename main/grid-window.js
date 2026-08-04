const { BrowserWindow, screen: electronScreen } = require('electron');
const { preloadPath } = require('./paths');
const { devArguments } = require('./dev-flags');
const { clampToDisplayWorkArea, resolveTargetDisplay } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus } = require('./control-channel');
const { hasFrameWindowFor } = require('./frame-windows');

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
    // Remembered so a dev restart can reopen the grid view as it was.
    lastGridConfig = config;

    const frames = config.frames || [];
    const grid = config.grid || { cols: 2, rows: 1, gap: 0 };
    const frameSize = config.frameSize || { width: 1100, height: 500 };
    const gap = grid.gap || 0;

    // Close the previous grid window (if any) BEFORE creating the new one and
    // reassigning gridWindow/gridFrameIds. The old window's 'closed' handler
    // fires asynchronously; if we reassigned first, that stale handler would
    // null out state that already belongs to the new window.
    forceCloseGrid();
    gridWindow = null;
    gridFrameIds = [];

    const totalWidth  = grid.cols * frameSize.width  + (grid.cols - 1) * gap;
    const totalHeight = grid.rows * frameSize.height + (grid.rows - 1) * gap;

    // An explicit monitor choice (config.position.monitor) targets that
    // display; otherwise fall back to the primary display, matching behavior
    // from before this option existed.
    const target = config.position && config.position.monitor != null
        ? resolveTargetDisplay(config.position).display
        : electronScreen.getPrimaryDisplay();
    const wa = target.workArea;

    // One scale factor for BOTH axes, and the window itself sized to exactly
    // that scaled content (not independently clamped per axis) — otherwise
    // the non-binding axis stays at its full unscaled size while the content
    // shrinks by the other axis's factor, leaving dead space instead of the
    // grid filling the window.
    const scale = Math.min(1, wa.width / totalWidth, wa.height / totalHeight);
    const winWidth = Math.round(totalWidth * scale);
    const winHeight = Math.round(totalHeight * scale);
    const clamped = clampToDisplayWorkArea(target, null, null, winWidth, winHeight);

    // Passed as a single JSON blob (not delimiter-joined tokens) so a frame
    // label can contain any character without colliding with the encoding.
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
        // See openFrameWindow's matching option: without this the title bar
        // eats into the content area, drifting cell iframes away from their
        // configured frame size.
        useContentSize: true,
        frame: true,
        show: false,
        backgroundColor: '#000',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            devTools: true,
            backgroundThrottling: false,
            additionalArguments: devArguments(),
        },
    });
    // Grid view never enters Electron fullscreen, so unlike live frame
    // windows it has no case for always-on-top — that would just permanently
    // block reaching any other window (including the control panel) behind it.

    gridWindow = win;
    gridFrameIds = [...new Set(frames.map(f => f.frameId))];

    win.loadFile('frames.html', {
        search: [
            'cells=' + encodeURIComponent(JSON.stringify(cellsPayload)),
            'cols=' + grid.cols,
            'rows=' + grid.rows,
            'frameW=' + frameSize.width,
            'frameH=' + frameSize.height,
            'gap=' + gap,
            'scale=' + scale,
        ].join('&')
    });

    win.once('ready-to-show', () => win.show());

    // Cmd/Ctrl+W closes — the 'close' handler below owns the confirm-before-
    // close logic so this and the native title-bar close button behave
    // identically.
    attachCloseShortcuts(win, {});

    // Confirm before closing, regardless of how the close was triggered
    // (native title-bar button, Cmd/Ctrl+W, OS Cmd+Q, etc.) — see the matching
    // frame-window guard for why this can no longer be skipped now that the
    // window has a real title bar. The pre-emptive close at the top of this
    // function and app:exitToStartup both set win.__forceClose first so those
    // don't double-prompt.
    win.on('close', (event) => {
        if (!confirmClose(win, {
            title: 'Close grid view?',
            message: 'This closes the grid view. Any frame with its own independent live window is unaffected.'
        })) {
            event.preventDefault();
        }
    });

    win.webContents.on('did-finish-load', () => {
        // Only report status for frames that don't have their own live window —
        // overwriting an independent window's status would desync the operator panel.
        gridFrameIds.forEach(fId => {
            if (!hasFrameWindowFor(fId)) notifyFrameStatus(fId, 'ready');
        });
    });

    win.on('closed', () => {
        // Guard against a stale closure: if a newer grid window has already
        // replaced this one, this handler must not touch the current state.
        if (gridWindow !== win) return;
        gridFrameIds.forEach(fId => {
            if (!hasFrameWindowFor(fId)) notifyFrameStatus(fId, 'closed');
        });
        gridWindow = null;
        gridFrameIds = [];
        lastGridConfig = null;
    });

    win.webContents.openDevTools({
        mode: 'detach'
    })

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
