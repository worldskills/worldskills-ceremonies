const { BrowserWindow, screen: electronScreen } = require('electron');
const { baseWebPreferences } = require('./window-factory');
const { centerOnDisplay, resolveTargetDisplay } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus } = require('./control-channel');
const { hasFrameWindowFor } = require('./frame-windows');
const { markWindow } = require('./ipc/sender-role');
const { FEED, FRAME_STATUS } = require('./constants');

// Each Open Grid View action creates an independent output. The entry keeps the
// per-window state that used to be global, allowing Live and Preview grids to
// coexist on different displays.
const gridWindows = new Map();

function forceCloseGrid() {
    gridWindows.forEach((entry, win) => {
        if (win.isDestroyed()) return;
        win.__forceClose = true;
        if (win.isFullScreen()) win.setFullScreen(false);
        win.close();
    });
}

function hasGridWindowFor(frameId) {
    for (const [win, entry] of gridWindows) {
        if (!win.isDestroyed() && entry.frameIds.has(frameId)) return true;
    }
    return false;
}

function notifyClosedIfUnused(frameId) {
    if (!hasFrameWindowFor(frameId) && !hasGridWindowFor(frameId)) {
        notifyFrameStatus(frameId, FRAME_STATUS.CLOSED);
    }
}

function notifyGridFramesReady(entry) {
    entry.frameIds.forEach((frameId) => {
        if (!hasFrameWindowFor(frameId)) notifyFrameStatus(frameId, FRAME_STATUS.READY);
    });
}

function openGridWindow(config) {
    const frames = config.frames || [];
    const grid = config.grid || { cols: 2, gap: 0 };
    const frameSize = config.frameSize || { width: 1100, height: 500 };
    const gap = grid.gap || 0;
    const goFullscreen = config.fullscreen === true;

    // Explicit config.position.monitor targets that display; otherwise fall back to the primary display (pre-existing behavior).
    const target = config.position && config.position.monitor != null
        ? resolveTargetDisplay(config.position).display
        : electronScreen.getPrimaryDisplay();
    const wa = target.workArea;
    const availableWidth = goFullscreen ? target.bounds.width : wa.width;
    const availableHeight = goFullscreen ? target.bounds.height : wa.height;
    const centered = centerOnDisplay(target, wa.width, wa.height);

    // JSON blob, not delimiter-joined tokens, so a frame label can contain any character without colliding with the encoding.
    const framesPayload = frames.map(f => ({
        frameId: f.frameId,
        label: f.label || '',
        accent: f.accent || '',
        container: f.container || '',
    }));

    const win = new BrowserWindow({
        width: wa.width,
        height: wa.height,
        x: centered.x,
        y: centered.y,
        // Grid output is a clean capture surface; keyboard close handling remains
        // available through attachCloseShortcuts below.
        useContentSize: true,
        frame: false,
        show: false,
        backgroundColor: '#000',
        // Without nodeIntegrationInSubFrames, the preload's window.ceremonator only reaches frames.html itself, not its iframes — silently breaking screen.js's translation IPC in grid view.
        webPreferences: baseWebPreferences({ nodeIntegrationInSubFrames: true, backgroundThrottling: false, ceremonatorRole: 'output' }),
    });
    markWindow(win, 'output');
    // Measure any platform-specific content inset and tell the renderer the real
    // maximum canvas it may occupy (zero for the normal frameless grid window).
    const outerSize = win.getSize();
    const contentSize = win.getContentSize();
    const maxContentWidth = Math.max(320, availableWidth - (outerSize[0] - contentSize[0]));
    const maxContentHeight = Math.max(240, availableHeight - (outerSize[1] - contentSize[1]));
    // Do not pin the grid always-on-top. Native fullscreen already provides the
    // requested output surface without trapping the control panel beneath it.

    const entry = {
        config: config,
        frameIds: new Set(frames.map(f => f.frameId)),
        targetDisplay: target,
        goFullscreen: goFullscreen,
    };
    gridWindows.set(win, entry);

    win.loadFile('src/views/frames.html', {
        search: [
            'frames=' + encodeURIComponent(JSON.stringify(framesPayload)),
            'cols=' + grid.cols,
            'cellW=' + frameSize.width,
            'cellH=' + frameSize.height,
            'gap=' + gap,
            'feed=' + (config.feed || FEED.LIVE),
            'maxW=' + maxContentWidth,
            'maxH=' + maxContentHeight,
            'testMode=' + (config.testMode ? '1' : '0'),
            'gridCols=' + grid.cols,
            'fullscreen=' + (goFullscreen ? '1' : '0'),
        ].join('&')
    });

    // No 'ready-to-show' → show() here: the window stays hidden until fitGridWindow() has sized it
    // to the rendered grid, so it never flashes at work-area size first.

    // Cmd/Ctrl+W remains the operator close gesture for this frameless window.
    attachCloseShortcuts(win, { escapeLeavesFullscreen: true });

    // Confirms on every close path; forceCloseGrid()'s win.__forceClose skips it.
    win.on('close', (event) => {
        if (!confirmClose(win, {
            title: 'Close grid view?',
            message: 'This closes the grid view. Any frame with its own independent live window is unaffected.'
        })) {
            event.preventDefault();
        }
    });

    win.webContents.on('did-finish-load', () => {
        // Safety net: if the renderer never reports a size (crashed, or its preload API is missing),
        // show it anyway at work-area size. A wrong-sized grid beats an invisible one on show day.
        setTimeout(() => {
            if (gridWindows.has(win) && !win.isDestroyed() && !win.isVisible()) {
                win.show();
                if (entry.goFullscreen) win.setFullScreen(true);
                notifyGridFramesReady(entry);
            }
        }, 3000);
    });

    win.on('closed', () => {
        const frameIds = Array.from(entry.frameIds);
        gridWindows.delete(win);
        frameIds.forEach(notifyClosedIfUnused);
    });

    return { ok: true };
}

// Called once by the grid renderer after the project's grid.html has rendered and been scaled to
// fit — it is the only side that knows how many cells the project actually laid out.
function fitGridWindow(sender, size) {
    let gridWindow = null;
    let entry = null;
    for (const [candidate, candidateEntry] of gridWindows) {
        if (!candidate.isDestroyed() && candidate.webContents === sender) {
            gridWindow = candidate;
            entry = candidateEntry;
            break;
        }
    }
    if (!gridWindow || !entry) {
        return { ok: false, error: 'Not the grid window' };
    }
    const width = Math.max(320, Math.round(size && size.width) || 0);
    const height = Math.max(240, Math.round(size && size.height) || 0);

    if (Array.isArray(size && size.frameIds)) {
        const previousFrameIds = entry.frameIds;
        entry.frameIds = new Set(size.frameIds);
        previousFrameIds.forEach((frameId) => {
            if (!entry.frameIds.has(frameId)) notifyClosedIfUnused(frameId);
        });
    }

    notifyGridFramesReady(entry);

    gridWindow.setContentSize(width, height);
    const target = entry.targetDisplay || electronScreen.getPrimaryDisplay();
    // Center the complete native window, not only its content rectangle.
    const fittedOuterSize = gridWindow.getSize();
    const centered = centerOnDisplay(target, fittedOuterSize[0], fittedOuterSize[1]);
    gridWindow.setPosition(centered.x, centered.y);
    gridWindow.show();
    if (entry.goFullscreen) gridWindow.setFullScreen(true);
    return { ok: true };
}

function isGridOpen() {
    return getGridWindowCount() > 0;
}

function getGridWindowCount() {
    let count = 0;
    gridWindows.forEach((_entry, win) => {
        if (!win.isDestroyed()) count++;
    });
    return count;
}

function getGridFrameIds() {
    const ids = new Set();
    gridWindows.forEach((entry, win) => {
        if (!win.isDestroyed()) entry.frameIds.forEach((frameId) => ids.add(frameId));
    });
    return Array.from(ids);
}

function getGridConfigs() {
    const configs = [];
    gridWindows.forEach((entry, win) => {
        if (!win.isDestroyed()) configs.push(entry.config);
    });
    return configs;
}

function getLastGridConfig() {
    const configs = getGridConfigs();
    return configs.length ? configs[configs.length - 1] : null;
}

module.exports = {
    openGridWindow,
    fitGridWindow,
    isGridOpen,
    getGridWindowCount,
    getGridFrameIds,
    getGridConfigs,
    getLastGridConfig,
    hasGridWindowFor,
    forceCloseGrid,
};
