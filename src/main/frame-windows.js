const { BrowserWindow } = require('electron');
const { baseWebPreferences } = require('./window-factory');
const { centerOnDisplay, resolveTargetDisplay, displayIndexForPoint } = require('./display-geometry');
const { attachCloseShortcuts, confirmClose } = require('./window-close-guard');
const { markWindow } = require('./ipc/sender-role');
const { notifyFrameStatus, sendControlNotice } = require('./control-channel');
const { FEED, FRAME_STATUS } = require('./constants');

const frameWindows = new Map();
// Keyed like frameWindows; a dev restart uses this to reopen exactly what was open.
const frameWindowOpts = new Map();

// Every open spawns a new window (any number of Live/Preview windows per frame), so the
// key is a serial, not an identity — frameId/container are still embedded for readability.
let winSeq = 0;
function frameWindowKey(frameId, container) {
    winSeq += 1;
    return frameId + (container ? ':' + container : '') + '#' + winSeq;
}

function parseFrameWindowKey(key) {
    const hashIdx = key.indexOf('#');
    const withoutSeq = hashIdx < 0 ? key : key.slice(0, hashIdx);
    const colonIdx = withoutSeq.indexOf(':');
    return colonIdx < 0 ? { frameId: withoutSeq, container: '' } : { frameId: withoutSeq.slice(0, colonIdx), container: withoutSeq.slice(colonIdx + 1) };
}

function matchesFrameKey(key, frameId) {
    return parseFrameWindowKey(key).frameId === frameId;
}

// Live/preview window counts for a frame, from the surviving frameWindowOpts entries (kept
// in sync with frameWindows — both are deleted together on close). Drives the frame-card
// "×N" badges and the closed→ready status downgrade when only one of several windows closes.
function countFrameWindows(frameId) {
    let live = 0, preview = 0;
    frameWindowOpts.forEach((opts, key) => {
        if (parseFrameWindowKey(key).frameId !== frameId) return;
        if (opts && opts.preview) preview++; else live++;
    });
    return { live, preview, total: live + preview };
}

// Wraps notifyFrameStatus with the current window counts, and downgrades a 'closed' report to
// 'ready' when other windows of the same frame are still open (e.g. one half of a Split pair,
// or one of several duplicate Live windows).
function emitFrameStatus(frameId, status, extra) {
    const windows = countFrameWindows(frameId);
    const effectiveStatus = (status === FRAME_STATUS.CLOSED && windows.total > 0) ? FRAME_STATUS.READY : status;
    notifyFrameStatus(frameId, effectiveStatus, Object.assign({}, extra, { windows: windows }));
}

function normalizeFrameRequest(frameId, opts) {
    const container = (opts && opts.container) || '';
    const key = frameWindowKey(frameId, container);
    const isPreview = !!(opts && opts.preview);
    const size = isPreview
        ? { width: 1280, height: 720 }
        : ((opts && opts.size) || { width: 1920, height: 1080 });
    const position = (opts && opts.position) || {};

    const goFullscreenRequested = !isPreview && position.fullscreen === true && (!opts || opts.windowed !== true);
    return { container, key, isPreview, size, position, goFullscreenRequested };
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

        winBounds = {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height
        };
    } else {
        // Cascade duplicate windows of the same frame by 40px per window already open, so
        // spawning several Live/Preview windows doesn't stack them invisibly on top of each other.
        const cascade = 40 * countFrameWindows(frameId).total;
        // Coordinates already encode which display the user dragged it to; otherwise center fresh
        // on the assigned target display. No fit-to-display shrinking or on-screen clamping — a
        // frame's configured size is expected to fit its assigned display.
        const origin = (position.x != null && position.y != null)
            ? { x: position.x, y: position.y }
            : centerOnDisplay(targetDisplay, size.width, size.height);
        winBounds = { x: origin.x + cascade, y: origin.y + cascade, width: size.width, height: size.height };
    }

    return { winBounds, fallbackNotice };
}

function createFrameBrowserWindow(winBounds, req) {
    const win = new BrowserWindow({
        width: winBounds.width,
        height: winBounds.height,
        x: winBounds.x,
        y: winBounds.y,
        // Without this, width/height are outer bounds; the title bar would eat into content and drift the viewport off its configured ratio.
        useContentSize: true,
        fullscreen: false,
        frame: true,
        show: false,
        backgroundColor: '#000',
        webPreferences: baseWebPreferences({ backgroundThrottling: false, ceremonatorRole: 'output' }),
    });
    markWindow(win, 'output');

    return win;
}

// Always-on-top only while fullscreen — pinning a windowed live output (e.g. after Escape, or a
// dev-restart's windowed open) would leave it unreachable above every other window. Plain
// setAlwaysOnTop (not the 'screen-saver' level) so a fullscreen live window still floats above
// ordinary windows during a show, but never above the OS/other apps/the control panel itself.
function pinLiveWindowWhileFullscreen(win, req) {
    if (req.isPreview) return;
    if (req.goFullscreenRequested) win.setAlwaysOnTop(true);
    win.on('enter-full-screen', () => win.setAlwaysOnTop(true));
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
    // preview=true stays the window-chrome flag (size/fullscreen/F11); feed=preview is the
    // separate localStorage channel screen.js reads from (see frame-state.service.js).
    const feedParam = req.isPreview ? '&feed=' + FEED.PREVIEW : '';
    return 'screen=' + frameId + (req.isPreview ? '&preview=true' : '') + labelParam + containerParam + feedParam;
}

function reportFrameStatus(win, frameId) {
    win.webContents.on('did-finish-load', () => {
        emitFrameStatus(frameId, FRAME_STATUS.READY);
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        emitFrameStatus(frameId, FRAME_STATUS.CRASHED, { reason: errorDescription });
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        emitFrameStatus(frameId, FRAME_STATUS.CRASHED, { reason: details ? details.reason : 'render-process-gone' });
    });

    win.on('unresponsive', () => {
        emitFrameStatus(frameId, FRAME_STATUS.CRASHED, { reason: 'unresponsive' });
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

// Preview windows require a Live window to exist (enforced in openFrameWindowPreview,
// control/frames.part.js) — if the Live window that just closed was the last one for this
// frame, any Preview window(s) would otherwise be orphaned, so close them too. Preview windows
// never confirm-dialog on close (guardLiveClose skips them) and are never fullscreen, so a plain
// win.close() is enough — this recurses into cleanupOnClosed for each one, but req.isPreview is
// true there, so it never re-triggers this cascade.
function closePreviewWindowsFor(frameId) {
    frameWindows.forEach((win, key) => {
        if (!matchesFrameKey(key, frameId)) return;
        const opts = frameWindowOpts.get(key);
        if (opts && opts.preview && !win.isDestroyed()) win.close();
    });
}

function cleanupOnClosed(win, key, frameId, boundsState, req) {
    win.on('closed', () => {
        frameWindows.delete(key);
        frameWindowOpts.delete(key);
        if (!req.isPreview && countFrameWindows(frameId).live === 0) {
            closePreviewWindowsFor(frameId);
        }
        if (boundsState.lastPos) {
            const w = boundsState.lastSize ? boundsState.lastSize[0] : null;
            const h = boundsState.lastSize ? boundsState.lastSize[1] : null;
            const monitor = displayIndexForPoint(boundsState.lastPos[0], boundsState.lastPos[1]);
            emitFrameStatus(frameId, FRAME_STATUS.CLOSED, { x: boundsState.lastPos[0], y: boundsState.lastPos[1], width: w, height: h, monitor: monitor });
        } else {
            emitFrameStatus(frameId, FRAME_STATUS.CLOSED);
        }
    });
}

// Every call spawns a fresh window — as many Live/Preview windows per frame as the operator
// wants. There is no reuse-the-existing-window path: that used to resize/reposition whatever
// window happened to share the frameId (even a Preview window when Live was requested), which
// silently ran live output under preview semantics.
function openFrameWindow(frameId, opts) {
    const req = normalizeFrameRequest(frameId, opts);

    const { winBounds, fallbackNotice } = frameWindowBounds(req, frameId, opts);
    if (fallbackNotice) {
        sendControlNotice('warning', fallbackNotice);
    }

    const win = createFrameBrowserWindow(winBounds, req);
    pinLiveWindowWhileFullscreen(win, req);
    showWhenPainted(win, req.goFullscreenRequested);
    attachCloseShortcuts(win, { escapeLeavesFullscreen: true });

    win.loadFile('src/views/screen.html', { search: frameWindowSearch(frameId, req, opts) });
    frameWindows.set(req.key, win);
    frameWindowOpts.set(req.key, Object.assign({ frameId: frameId }, opts || {}));
    emitFrameStatus(frameId, FRAME_STATUS.CONNECTING);

    reportFrameStatus(win, frameId);
    const boundsState = trackWindowedBounds(win);
    guardLiveClose(win, req, boundsState);
    cleanupOnClosed(win, req.key, frameId, boundsState, req);

    return win;
}

// Matches every window open for this frame (any number of Live/Preview duplicates, plus its
// :kv/:state halves), so closing a frame closes all of its live output, not just one window.
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

// Matches every window open for this frame — Split frames are keyed 'a:kv'/'a:state', never bare 'a', so an exact match would silently no-op.
function reloadFrameWindow(frameId) {
    let reloadedCount = 0;
    frameWindows.forEach((win, key) => {
        if (!matchesFrameKey(key, frameId) || win.isDestroyed()) return;
        win.webContents.reload();
        reloadedCount++;
    });
    if (reloadedCount > 0) emitFrameStatus(frameId, FRAME_STATUS.CONNECTING);
    return { ok: reloadedCount > 0 };
}

function getFrameWindowPositions() {
    const result = {};
    const bestScore = {};
    frameWindows.forEach((win, key) => {
        // Fullscreen geometry is the whole display, not a usable windowed position (same skip as serializeOpenFrameWindows).
        if (win.isDestroyed() || win.isFullScreen()) return;
        const parsed = parseFrameWindowKey(key);
        const opts = frameWindowOpts.get(key) || {};
        // Prefer a bare (non-Split), non-preview window when several are open for one frame —
        // Save Project expects exactly one entry per frame. Lower score wins; ties keep the first seen.
        const score = (opts.preview ? 10 : 0) + (parsed.container ? 1 : 0);
        if (bestScore[parsed.frameId] !== undefined && score >= bestScore[parsed.frameId]) return;
        bestScore[parsed.frameId] = score;
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

// Same reconciliation path as getOpenFrameIds, plus the ×N window-count badges.
function getOpenFrameCounts() {
    const counts = {};
    getOpenFrameIds().forEach((frameId) => {
        counts[frameId] = countFrameWindows(frameId);
    });
    return counts;
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
            opts: frameWindowOpts.get(key) || { frameId: parseFrameWindowKey(key).frameId }
        });
    });
    return list;
}

// Always reopens windowed, never fullscreen — a dev restart shouldn't resurrect a fullscreen always-on-top window over the editor.
function reopenFrameWindowFromSnapshot(entry) {
    const saved = (entry && entry.opts) || {};
    if (!saved.frameId) return;

    const opts = Object.assign({}, saved, { windowed: true });
    opts.position = Object.assign({}, saved.position, { fullscreen: false });
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

module.exports = {
    openFrameWindow,
    closeFrameWindow,
    reloadFrameWindow,
    getFrameWindowPositions,
    getOpenFrameIds,
    getOpenFrameCounts,
    hasFrameWindowFor,
    serializeOpenFrameWindows,
    reopenFrameWindowFromSnapshot,
    destroyAllFrameWindows,
};
