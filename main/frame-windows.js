const { BrowserWindow } = require('electron');
const { preloadPath } = require('./paths');
const { isDev, devArguments } = require('./dev-flags');
const { clampToWorkArea, clampToDisplayWorkArea, resolveTargetDisplay, displayIndexForPoint } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { notifyFrameStatus, sendControlNotice } = require('./control-channel');

const frameWindows = new Map();
// The opts each frame window was opened with, keyed the same way as
// frameWindows — so a dev restart can reopen exactly what was open.
const frameWindowOpts = new Map();

// Frame windows are keyed by frameId, or frameId + ':' + container for the
// Split KV/State mode (two independent windows per frame).
function frameWindowKey(frameId, container) {
    return frameId + (container ? ':' + container : '');
}

// Inverse of frameWindowKey: split a Map key back into its bare frameId and
// (possibly empty) container half.
function parseFrameWindowKey(key) {
    const i = key.indexOf(':');
    return i < 0 ? { frameId: key, container: '' } : { frameId: key.slice(0, i), container: key.slice(i + 1) };
}

// True when a frameWindows Map key belongs to frameId — either the bare key
// (normal mode) or one of its ':kv'/':state' halves (Split KV/State mode).
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

// Re-apply the latest config instead of a bare focus() — otherwise a config
// change (size/position/monitor/fullscreen) is silently dropped whenever the
// window is already open.
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

// Resolve the assigned display from position.monitor. Preview windows open
// windowed on that display; live windows open fullscreen on it so a single
// action puts each frame on its projector. Returns the fallback notice text
// instead of emitting it, keeping this side-effect-free.
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
        // Restore a previously-arranged windowed layout on whichever display
        // those coordinates fall on (honors a monitor the user dragged it to).
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
        // Without this, width/height are the OUTER window bounds, so the
        // native title bar (frame: true) would eat into the content area and
        // the rendered viewport would drift away from the configured ratio.
        useContentSize: true,
        fullscreen: false,
        kiosk: (!isPreview && position.kiosk) || false,
        frame: true,
        show: false,
        backgroundColor: '#000',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            backgroundThrottling: false,
            devTools: true,
            additionalArguments: devArguments(),
        },
    });

    if (isDev) win.webContents.openDevTools();

    return win;
}

// Live (non-preview) output must never be covered by an OS notification
// or another app window during the show. Only while actually fullscreen,
// though — otherwise a windowed live output (e.g. after Escape) would be
// stuck on top of everything with no way to reach the app behind it.
// A live window opened explicitly windowed (the dev-restart path) is not
// pinned up front, for the same reason it un-pins on leave-full-screen:
// otherwise it sits above every other window with no way to reach what is
// behind it. Entering fullscreen still pins it.
function pinLiveWindowWhileFullscreen(win, req) {
    if (req.isPreview) return;
    if (req.goFullscreenRequested) win.setAlwaysOnTop(true, 'screen-saver');
    win.on('enter-full-screen', () => win.setAlwaysOnTop(true, 'screen-saver'));
    win.on('leave-full-screen', () => win.setAlwaysOnTop(false));
}

// Show only once the page has actually painted, and enter fullscreen only
// after the window is placed + shown on the target display — so the
// audience never watches the app boot, and fullscreen lands on the
// correct monitor.
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

// Track the last windowed (non-fullscreen) position/size as the window moves
// or resizes, so the 'closed' status report below has real numbers even if
// the window was never dragged this session.
function trackWindowedBounds(win) {
    const state = { lastPos: null, lastSize: null };
    win.on('moved', () => { state.lastPos = win.getPosition(); });
    win.on('resize', () => { state.lastSize = win.getSize(); });
    return state;
}

// Confirm before closing live output, regardless of how the close was
// triggered (native title-bar button, Cmd/Ctrl+W, OS Cmd+Q, etc.) — the
// native title bar (added for M1's chrome fix) makes the close button a
// real click target, so this can no longer be skipped like it could when
// the window was frameless and only reachable via a keyboard shortcut.
// closeFrameWindow() sets win.__forceClose before calling close() for
// operator-confirmed closes so those don't double-prompt.
function guardLiveClose(win, req, boundsState) {
    win.on('close', (event) => {
        if (!req.isPreview && !confirmClose(win, {
            title: 'Close live output?',
            message: 'This closes a live audience-facing window. Continue?'
        })) {
            event.preventDefault();
            return;
        }
        // Snapshot the final windowed bounds so an arranged layout is
        // remembered even if the window was never dragged this session. Skip
        // while fullscreen (that geometry is the whole display, not a useful
        // windowed position).
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

    win.loadFile('screen.html', { search: frameWindowSearch(frameId, req, opts) });
    frameWindows.set(req.key, win);
    frameWindowOpts.set(req.key, Object.assign({ frameId: frameId }, opts || {}));
    notifyFrameStatus(frameId, 'connecting');

    reportFrameStatus(win, frameId);
    const boundsState = trackWindowedBounds(win);
    guardLiveClose(win, req, boundsState);
    cleanupOnClosed(win, req.key, frameId, boundsState);

    return win;
}

// Closes every window for a frame id — the bare id (normal mode) and both
// ':kv'/':state' halves (Split mode) — so closing a frame always closes all
// of its live output, not just one half.
function closeFrameWindow(frameId) {
    frameWindows.forEach((win, key) => {
        if (!matchesFrameKey(key, frameId)) return;
        if (!win.isDestroyed()) {
            // Operator already confirmed via the control panel's own confirm()
            // before invoking this — skip the 'close' handler's own dialog.
            win.__forceClose = true;
            // A frameless window in native fullscreen can fail to close on
            // macOS; leave fullscreen first so close() reliably takes effect.
            if (win.isFullScreen()) win.setFullScreen(false);
            win.close();
        }
        frameWindows.delete(key);
        frameWindowOpts.delete(key);
    });
}

// Reload every window for this frame — the bare key (normal mode) and both
// ':kv'/':state' halves (Split KV/State mode) — so Split frames are actually
// reachable instead of silently no-opping (they're keyed 'a:kv'/'a:state',
// never a bare 'a').
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
        // Fullscreen geometry is the whole display, not a usable windowed
        // position — see the matching skip in serializeOpenFrameWindows.
        if (win.isDestroyed() || win.isFullScreen()) return;
        const parsed = parseFrameWindowKey(key);
        // Prefer the bare key over a Split KV/State container half when both
        // are open for the same frame — Save Project reads exactly one entry.
        if (parsed.container && bareFrameIds.has(parsed.frameId)) return;
        if (!parsed.container) bareFrameIds.add(parsed.frameId);
        const [x, y] = win.getPosition();
        // Content size, not outer size: windows are created with
        // useContentSize: true, so getSize() would include the title bar and
        // inflate the saved frame.size.
        const [width, height] = win.getContentSize();
        result[parsed.frameId] = { x, y, width, height, monitor: displayIndexForPoint(x, y) };
    });
    return result;
}

// Which frames currently have an open window. Lets a renderer that started
// *after* the windows did (the dev-restart path) reconcile its status badges,
// since those windows' 'connecting'/'ready' notices arrived too early to land.
function getOpenFrameIds() {
    const ids = [];
    frameWindows.forEach((win, key) => {
        if (win.isDestroyed()) return;
        const frameId = parseFrameWindowKey(key).frameId;
        if (ids.indexOf(frameId) < 0) ids.push(frameId);
    });
    return ids;
}

function hasFrameWindowFor(frameId) {
    return frameWindows.has(frameId);
}

// Which frame windows are open and where, so a dev restart can put them back.
function serializeOpenFrameWindows() {
    const list = [];
    frameWindows.forEach((win, key) => {
        if (win.isDestroyed()) return;
        const fullscreen = win.isFullScreen();
        const [x, y] = win.getPosition();
        const [width, height] = win.getContentSize();
        list.push({
            // Fullscreen geometry is the whole display, not a usable windowed
            // position — fall back to the opts the window was opened with.
            bounds: fullscreen ? null : { x, y, width, height },
            fullscreen: fullscreen,
            opts: frameWindowOpts.get(key) || { frameId: key.split(':')[0] }
        });
    });
    return list;
}

// Reopen one snapshotted window. Always windowed, never fullscreen: an edit to
// main.js should not resurrect a fullscreen always-on-top window over the
// editor. The preview/live distinction is preserved.
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

function forceCloseAllFrameWindows() {
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.__forceClose = true;
            win.close();
        }
    });
    frameWindows.clear();
    frameWindowOpts.clear();
}

function destroyAllFrameWindows() {
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) win.destroy();
    });
    frameWindows.clear();
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
    forceCloseAllFrameWindows,
    destroyAllFrameWindows,
    clampAllFrameWindowsToWorkArea,
};
