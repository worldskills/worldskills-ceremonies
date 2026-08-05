const { BrowserWindow } = require('electron');
const { isDev } = require('./dev-flags');
const { baseWebPreferences } = require('./window-factory');
const { clampToWorkArea, clampToDisplayWorkArea, resolveTargetDisplay, displayIndexForPoint } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus, sendControlNotice } = require('./control-channel');

const frameWindows = new Map();
// Keyed like frameWindows; a dev restart uses this to reopen exactly what was open.
const frameWindowOpts = new Map();

// Split KV/State mode keys windows as frameId:kv / frameId:state, not bare frameId.
function frameWindowKey(frameId, container) {
    return frameId + (container ? ':' + container : '');
}

function parseFrameWindowKey(key) {
    const i = key.indexOf(':');
    return i < 0 ? { frameId: key, container: '' } : { frameId: key.slice(0, i), container: key.slice(i + 1) };
}

function matchesFrameKey(key, frameId) {
    return key === frameId || key.indexOf(frameId + ':') === 0;
}

function normalizeFrameRequest(frameId, opts) {
    const container = (opts && opts.container) || '';
    const key = frameWindowKey(frameId, container);
    const isPreview = !!(opts && opts.preview);
    const size = isPreview
        ? { width: 1280, height: 720 }
        : ((opts && opts.size) || { width: 1920, height: 1080 });
    const position = (opts && opts.position) || {};
    const goFullscreenRequested = !isPreview && opts && opts.windowed !== true;
    return { container, key, isPreview, size, position, goFullscreenRequested };
}

// Re-applies config instead of a bare focus(), so a size/position/monitor/fullscreen change isn't silently dropped when the window is already open.
function reapplyToExistingWindow(existing, req, opts, frameId) {
    const { size, position, isPreview, goFullscreenRequested, key } = req;
    if (position.x != null && position.y != null) {
        const bounds = clampToWorkArea(position.x, position.y, size.width, size.height);
        existing.setBounds(bounds);
    } else {
        existing.setSize(size.width, size.height);
    }
    if (typeof position.kiosk === 'boolean') existing.setKiosk(!isPreview && position.kiosk);
    existing.setFullScreen(goFullscreenRequested);
    existing.focus();
    frameWindowOpts.set(key, Object.assign({ frameId: frameId }, opts || {}));
    return existing;
}

// Returns the fallback notice text instead of emitting it, to keep this function side-effect-free.
function frameWindowBounds(req, frameId, opts) {
    const { size, position, goFullscreenRequested } = req;
    const resolved = resolveTargetDisplay(position);
    const targetDisplay = resolved.display;
    let fallbackNotice = null;
    if (resolved.fellBack) {
        fallbackNotice = 'Frame "' + ((opts && opts.label) || frameId) + '" is assigned to display ' +
            (resolved.requested + 1) + ', but only ' + resolved.available + ' display(s) are connected. Opening on the primary display.';
    }

    let winBounds;
    if (goFullscreenRequested) {
        const b = targetDisplay.bounds;
        winBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    } else if (position.x != null && position.y != null) {
        // Coordinates already encode which display the user dragged it to; clampToWorkArea auto-detects that display.
        winBounds = clampToWorkArea(position.x, position.y, size.width, size.height);
    } else {
        winBounds = clampToDisplayWorkArea(targetDisplay, position.x, position.y, size.width, size.height);
    }

    return { winBounds, fallbackNotice };
}

function createFrameBrowserWindow(winBounds, req) {
    const { isPreview, position } = req;
    const win = new BrowserWindow({
        width: winBounds.width,
        height: winBounds.height,
        x: winBounds.x,
        y: winBounds.y,
        // Without this, width/height are outer bounds; the title bar would eat into content and drift the viewport off its configured ratio.
        useContentSize: true,
        fullscreen: false,
        kiosk: (!isPreview && position.kiosk) || false,
        frame: true,
        show: false,
        backgroundColor: '#000',
        webPreferences: baseWebPreferences({ backgroundThrottling: false }),
    });

    if (isDev) win.webContents.openDevTools();

    return win;
}

// Always-on-top only while fullscreen — pinning a windowed live output (e.g. after Escape, or a dev-restart's windowed open) would leave it unreachable above every other window.
function pinLiveWindowWhileFullscreen(win, req) {
    if (req.isPreview) return;
    if (req.goFullscreenRequested) win.setAlwaysOnTop(true, 'screen-saver');
    win.on('enter-full-screen', () => win.setAlwaysOnTop(true, 'screen-saver'));
    win.on('leave-full-screen', () => win.setAlwaysOnTop(false));
}

// Show only after paint, fullscreen only after show — so the audience never sees the app boot and fullscreen lands on the right monitor.
function showWhenPainted(win, goFullscreen) {
    win.once('ready-to-show', () => {
        win.show();
        if (goFullscreen) win.setFullScreen(true);
    });
}

function frameWindowSearch(frameId, req, opts) {
    const labelParam = (opts && opts.label) ? '&label=' + encodeURIComponent(opts.label) : '';
    const containerParam = req.container ? '&container=' + encodeURIComponent(req.container) : '';
    return 'screen=' + frameId + (req.isPreview ? '&preview=true' : '') + labelParam + containerParam;
}

function reportFrameStatus(win, frameId) {
    win.webContents.on('did-finish-load', () => {
        notifyFrameStatus(frameId, 'ready');
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        notifyFrameStatus(frameId, 'crashed', { reason: errorDescription });
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        notifyFrameStatus(frameId, 'crashed', { reason: details ? details.reason : 'render-process-gone' });
    });

    win.on('unresponsive', () => {
        notifyFrameStatus(frameId, 'crashed', { reason: 'unresponsive' });
    });
}

// Tracks windowed bounds so the 'closed' status report has real numbers even if the window was never dragged this session.
function trackWindowedBounds(win) {
    const state = { lastPos: null, lastSize: null };
    win.on('moved', () => { state.lastPos = win.getPosition(); });
    win.on('resize', () => { state.lastSize = win.getSize(); });
    return state;
}

// Guards every close path now that the native title bar (M1 fix) gives a real close button; win.__forceClose (set by closeFrameWindow) skips the dialog for already-confirmed closes.
function guardLiveClose(win, req, boundsState) {
    win.on('close', (event) => {
        if (!req.isPreview && !confirmClose(win, {
            title: 'Close live output?',
            message: 'This closes a live audience-facing window. Continue?'
        })) {
            event.preventDefault();
            return;
        }
        // Skip while fullscreen — that geometry is the whole display, not a useful windowed position to restore later.
        if (!win.isDestroyed() && !win.isFullScreen()) {
            boundsState.lastPos = win.getPosition();
            boundsState.lastSize = win.getSize();
        }
    });
}

function cleanupOnClosed(win, key, frameId, boundsState) {
    win.on('closed', () => {
        frameWindows.delete(key);
        frameWindowOpts.delete(key);
        if (boundsState.lastPos) {
            const w = boundsState.lastSize ? boundsState.lastSize[0] : null;
            const h = boundsState.lastSize ? boundsState.lastSize[1] : null;
            const monitor = displayIndexForPoint(boundsState.lastPos[0], boundsState.lastPos[1]);
            notifyFrameStatus(frameId, 'closed', { x: boundsState.lastPos[0], y: boundsState.lastPos[1], width: w, height: h, monitor: monitor });
        } else {
            notifyFrameStatus(frameId, 'closed');
        }
    });
}

function openFrameWindow(frameId, opts) {
    const req = normalizeFrameRequest(frameId, opts);

    if (frameWindows.has(req.key)) {
        const existing = frameWindows.get(req.key);
        if (!existing.isDestroyed()) {
            return reapplyToExistingWindow(existing, req, opts, frameId);
        }
        frameWindows.delete(req.key);
        frameWindowOpts.delete(req.key);
    }

    const { winBounds, fallbackNotice } = frameWindowBounds(req, frameId, opts);
    if (fallbackNotice) sendControlNotice('warning', fallbackNotice);

    const win = createFrameBrowserWindow(winBounds, req);
    pinLiveWindowWhileFullscreen(win, req);
    showWhenPainted(win, req.goFullscreenRequested);
    attachCloseShortcuts(win, { escapeLeavesFullscreen: true });

    win.loadFile('src/views/screen.html', { search: frameWindowSearch(frameId, req, opts) });
    frameWindows.set(req.key, win);
    frameWindowOpts.set(req.key, Object.assign({ frameId: frameId }, opts || {}));
    notifyFrameStatus(frameId, 'connecting');

    reportFrameStatus(win, frameId);
    const boundsState = trackWindowedBounds(win);
    guardLiveClose(win, req, boundsState);
    cleanupOnClosed(win, req.key, frameId, boundsState);

    return win;
}

// Matches the bare id and its :kv/:state halves, so closing a frame closes all its live output, not just one half.
function closeFrameWindow(frameId) {
    frameWindows.forEach((win, key) => {
        if (!matchesFrameKey(key, frameId)) return;
        if (!win.isDestroyed()) {
            // Operator already confirmed in the control panel; skip the close handler's own dialog.
            win.__forceClose = true;
            // macOS: a frameless fullscreen window can fail to close; leave fullscreen first so close() takes effect.
            if (win.isFullScreen()) win.setFullScreen(false);
            win.close();
        }
        frameWindows.delete(key);
        frameWindowOpts.delete(key);
    });
}

// Matches the bare key and :kv/:state halves — Split frames are keyed 'a:kv'/'a:state', never bare 'a', so an exact match would silently no-op.
function reloadFrameWindow(frameId) {
    let reloadedCount = 0;
    frameWindows.forEach((win, key) => {
        if (!matchesFrameKey(key, frameId) || win.isDestroyed()) return;
        win.webContents.reload();
        reloadedCount++;
    });
    if (reloadedCount > 0) notifyFrameStatus(frameId, 'connecting');
    return { ok: reloadedCount > 0 };
}

function getFrameWindowPositions() {
    const result = {};
    const bareFrameIds = new Set();
    frameWindows.forEach((win, key) => {
        // Fullscreen geometry is the whole display, not a usable windowed position (same skip as serializeOpenFrameWindows).
        if (win.isDestroyed() || win.isFullScreen()) return;
        const parsed = parseFrameWindowKey(key);
        // Prefer the bare key over a Split KV/State half when both are open — Save Project expects exactly one entry per frame.
        if (parsed.container && bareFrameIds.has(parsed.frameId)) return;
        if (!parsed.container) bareFrameIds.add(parsed.frameId);
        const [x, y] = win.getPosition();
        // getContentSize, not getSize: windows use useContentSize: true, so getSize() would include the title bar and inflate frame.size.
        const [width, height] = win.getContentSize();
        result[parsed.frameId] = { x, y, width, height, monitor: displayIndexForPoint(x, y) };
    });
    return result;
}

// Lets a renderer that started after the windows did (dev-restart) reconcile status badges, since earlier 'connecting'/'ready' notices arrived too early to land.
function getOpenFrameIds() {
    const ids = [];
    frameWindows.forEach((win, key) => {
        if (win.isDestroyed()) return;
        const frameId = parseFrameWindowKey(key).frameId;
        if (ids.indexOf(frameId) < 0) ids.push(frameId);
    });
    return ids;
}

// Split KV/State windows are keyed 'frameId:kv'/'frameId:state', never bare frameId, so this can't be a plain Map.has() lookup.
function hasFrameWindowFor(frameId) {
    for (const key of frameWindows.keys()) {
        if (matchesFrameKey(key, frameId)) return true;
    }
    return false;
}

function serializeOpenFrameWindows() {
    const list = [];
    frameWindows.forEach((win, key) => {
        if (win.isDestroyed()) return;
        const fullscreen = win.isFullScreen();
        const [x, y] = win.getPosition();
        const [width, height] = win.getContentSize();
        list.push({
            // Fullscreen geometry is the whole display; bounds is null and callers fall back to the original opts.
            bounds: fullscreen ? null : { x, y, width, height },
            fullscreen: fullscreen,
            opts: frameWindowOpts.get(key) || { frameId: key.split(':')[0] }
        });
    });
    return list;
}

// Always reopens windowed, never fullscreen — a dev restart shouldn't resurrect a fullscreen always-on-top window over the editor.
function reopenFrameWindowFromSnapshot(entry) {
    const saved = (entry && entry.opts) || {};
    if (!saved.frameId) return;

    const opts = Object.assign({}, saved, { windowed: true });
    opts.position = Object.assign({}, saved.position, { fullscreen: false, kiosk: false });
    if (entry.bounds) {
        opts.size = { width: entry.bounds.width, height: entry.bounds.height };
        opts.position.x = entry.bounds.x;
        opts.position.y = entry.bounds.y;
        const monitor = displayIndexForPoint(entry.bounds.x, entry.bounds.y);
        if (monitor != null) opts.position.monitor = monitor;
    }
    openFrameWindow(saved.frameId, opts);
}

function destroyAllFrameWindows() {
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) win.destroy();
    });
    frameWindows.clear();
    frameWindowOpts.clear();
}

function clampAllFrameWindowsToWorkArea() {
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            const [wx, wy] = win.getPosition();
            const [ww, wh] = win.getSize();
            const clamped = clampToWorkArea(wx, wy, ww, wh);
            win.setBounds(clamped);
        }
    });
}

module.exports = {
    openFrameWindow,
    closeFrameWindow,
    reloadFrameWindow,
    getFrameWindowPositions,
    getOpenFrameIds,
    hasFrameWindowFor,
    serializeOpenFrameWindows,
    reopenFrameWindowFromSnapshot,
    destroyAllFrameWindows,
    clampAllFrameWindowsToWorkArea,
};
