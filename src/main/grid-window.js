const { BrowserWindow, screen: electronScreen } = require('electron');
const { baseWebPreferences, hideWindowMenu } = require('./window-factory');
const { centerOnDisplay, resolveTargetDisplay } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus } = require('./control-channel');
const { hasFrameWindowFor } = require('./frame-windows');
const projectStore = require('./project-store');
const { markWindow } = require('./ipc/sender-role');
const { FEED, FRAME_STATUS } = require('./constants');

// Each Open Grid View action creates an independent output. The entry keeps the
// per-window state that used to be global, allowing Live and Preview grids to
// coexist on different displays.
const gridWindows = new Map();
const GRID_CASCADE_OFFSET = 40;

function pinnedCanvas(displaySize) {
    if (!displaySize) return null;
    const width = Math.round(Number(displaySize.width)) || 0;
    const height = Math.round(Number(displaySize.height)) || 0;
    if (width < 320 || height < 240 || width > 15360 || height > 8640) return null;
    return { width, height };
}

function sameGridFrames(a, b) {
    const left = (a.frames || []).map((frame) => frame.frameId + ':' + (frame.container || '')).sort();
    const right = (b.frames || []).map((frame) => frame.frameId + ':' + (frame.container || '')).sort();
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

function hasMatchingLiveGrid(config) {
    for (const [win, entry] of gridWindows) {
        if (
            !win.isDestroyed() &&
            entry.config.feed === FEED.LIVE &&
            (entry.config.feedType || projectStore.primaryFeedId()) ===
                (config.feedType || projectStore.primaryFeedId()) &&
            sameGridFrames(entry.config, config)
        )
            return true;
    }
    return false;
}

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

function countGridWindowsOnDisplay(display) {
    let count = 0;
    gridWindows.forEach((entry, win) => {
        if (!win.isDestroyed() && entry.targetDisplay && entry.targetDisplay.id === display.id) count++;
    });
    return count;
}

function positionFittedGridWindow(win, entry) {
    const target = entry.targetDisplay || electronScreen.getPrimaryDisplay();
    const workArea = target.workArea;
    const size = win.getSize();
    const centered = centerOnDisplay(target, size[0], size[1]);
    // Offset successive grids so they are discoverable, clamping the result to
    // the usable display area when a grid fills most (or all) of the display.
    const maxX = Math.max(workArea.x, workArea.x + workArea.width - size[0]);
    const maxY = Math.max(workArea.y, workArea.y + workArea.height - size[1]);
    const x = Math.max(workArea.x, Math.min(maxX, centered.x + entry.cascadeOffset));
    const y = Math.max(workArea.y, Math.min(maxY, centered.y + entry.cascadeOffset));
    win.setPosition(x, y);
}

function openGridWindow(config) {
    config = config || {};
    if (
        [FEED.LIVE, FEED.PREVIEW].indexOf(config.feed || FEED.LIVE) < 0 ||
        !projectStore.isFeedId(config.feedType || projectStore.primaryFeedId())
    ) {
        return { ok: false, error: 'Invalid Grid feed or channel.' };
    }
    if (config.feed === FEED.PREVIEW && !hasMatchingLiveGrid(config)) {
        return { ok: false, error: 'Open a matching Live grid for this output feed first.' };
    }
    const frames = config.frames || [];
    const grid = config.grid || { cols: 2, gap: 0 };
    const frameSize = config.frameSize || { width: 1100, height: 500 };
    const gap = grid.gap || 0;
    const goFullscreen = config.fullscreen === true;
    const pinned = goFullscreen ? pinnedCanvas(config.displaySize) : null;

    // Explicit config.position.monitor targets that display; otherwise fall back to the primary display (pre-existing behavior).
    const target =
        config.position && config.position.monitor != null
            ? resolveTargetDisplay(config.position).display
            : electronScreen.getPrimaryDisplay();
    const wa = target.workArea;
    const availableWidth = goFullscreen ? target.bounds.width : wa.width;
    const availableHeight = goFullscreen ? target.bounds.height : wa.height;
    const centered = centerOnDisplay(target, wa.width, wa.height);
    const cascadeOffset = GRID_CASCADE_OFFSET * countGridWindowsOnDisplay(target);

    // JSON blob, not delimiter-joined tokens, so a frame label can contain any character without colliding with the encoding.
    const framesPayload = frames.map((f) => ({
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

        useContentSize: true,
        frame: true,
        title: 'Grid View',
        show: false,
        backgroundColor: '#000',

        webPreferences: baseWebPreferences({
            nodeIntegrationInSubFrames: true,
            backgroundThrottling: false,
            ceremonatorRole: 'output',
        }),
    });

    markWindow(win, 'output');
    hideWindowMenu(win);

    const outerSize = win.getSize();
    const contentSize = win.getContentSize();
    const maxContentWidth = pinned ? pinned.width : Math.max(320, availableWidth - (outerSize[0] - contentSize[0]));
    const maxContentHeight = pinned ? pinned.height : Math.max(240, availableHeight - (outerSize[1] - contentSize[1]));

    const entry = {
        config: config,
        frameIds: new Set(frames.map((f) => f.frameId)),
        targetDisplay: target,
        goFullscreen: goFullscreen,
        cascadeOffset: cascadeOffset,
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
            'feedType=' + encodeURIComponent(config.feedType || projectStore.primaryFeedId()),
            'maxW=' + maxContentWidth,
            'maxH=' + maxContentHeight,
            'testMode=' + (config.testMode ? '1' : '0'),
            'gridCols=' + grid.cols,
            'fullscreen=' + (goFullscreen ? '1' : '0'),
            // maxW/maxH alone are ambiguous: as an available maximum they only cap a
            // downscale, as a pinned canvas they *are* the surface. The renderer needs told which.
            'pinned=' + (pinned ? '1' : '0'),
            'autoFit=' + (config.autoFit ? '1' : '0'),
        ].join('&'),
    });

    attachCloseShortcuts(win, { escapeLeavesFullscreen: true });

    win.on('close', (event) => {
        if (
            !confirmClose(win, {
                title: 'Close grid view?',
                message: 'This closes the grid view. Any frame with its own independent live window is unaffected.',
            })
        ) {
            event.preventDefault();
        }
    });

    win.webContents.on('did-finish-load', () => {
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
    positionFittedGridWindow(gridWindow, entry);
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
    hasMatchingLiveGrid,
    hasGridWindowFor,
    forceCloseGrid,
};
