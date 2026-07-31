const { app, dialog, Menu, BrowserWindow, ipcMain, screen: electronScreen, protocol, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

if (require('electron-squirrel-startup')) {
    app.quit();
}

// ── Development mode ──────────────────────────────────────────────────
// Everything gated on isDev is a development affordance. A packaged
// show-day build takes none of these paths.
const isDev = !app.isPackaged;

// Serve templates from the app's bundled screens/ folder instead of the open
// project's template/ copy, so edits to screens/*.html are visible without
// re-copying them into the project. Launch with:
//   CEREMONATOR_DEFAULT_TEMPLATE=1 npm start
const forceDefaultTemplate = isDev && process.env.CEREMONATOR_DEFAULT_TEMPLATE === '1';

// Passed into every renderer so preload.js can expose the dev flags
// synchronously — control.js needs them before its first digest, which is too
// early for an async IPC round trip.
function devArguments() {
    const args = [];
    if (isDev) args.push('--ceremonator-dev');
    if (forceDefaultTemplate) args.push('--ceremonator-default-templates');
    return args;
}

// Must be called before app.whenReady
protocol.registerSchemesAsPrivileged([{
    scheme: 'wstemplate',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

const frameWindows = new Map();
// The opts each frame window was opened with, keyed the same way as
// frameWindows — so a dev restart can reopen exactly what was open.
const frameWindowOpts = new Map();
let controlWindow = null;
let startupWindow = null;

// Frame windows are keyed by frameId, or frameId + ':' + container for the
// Split KV/State mode (two independent windows per frame).
function frameWindowKey(frameId, container) {
    return frameId + (container ? ':' + container : '');
}

let activeProjectDir = null;
let activeTemplateDir = null;
let activeProject = null;

const userDataPath = app.getPath('userData');
const projectFilePath = path.join(userDataPath, 'project.json');
const configFilePath = path.join(userDataPath, 'config.json');
const devSessionFilePath = path.join(userDataPath, 'dev-session.json');
const DEV_SESSION_VERSION = 1;

// ── Config helpers ────────────────────────────────────────────────────

function readConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function writeConfig(cfg) {
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(cfg, null, 2));
    } catch (e) {}
}

function addRecent(dir, name) {
    const cfg = readConfig();
    const recent = cfg.recentProjects || [];
    const filtered = recent.filter(function (r) { return r.path !== dir; });
    filtered.unshift({ path: dir, name: name || path.basename(dir), lastOpened: new Date().toISOString() });
    cfg.recentProjects = filtered.slice(0, 8);
    cfg.lastProject = dir;
    writeConfig(cfg);
}

// ── Dev session helpers ───────────────────────────────────────────────
// electron-reloader reloads every renderer on a file change (and restarts the
// app outright when main.js or preload.js changes), which throws away the
// imported results and the assembled slide catalog — they live only in the
// control renderer's memory. This snapshot lets both sides come back.

function readDevSession() {
    if (!isDev) return null;
    try {
        if (fs.existsSync(devSessionFilePath)) {
            const snapshot = JSON.parse(fs.readFileSync(devSessionFilePath, 'utf8'));
            if (snapshot && snapshot.version === DEV_SESSION_VERSION) return snapshot;
        }
    } catch (e) {}
    return null;
}

function writeDevSession(snapshot) {
    try {
        // Not pretty-printed: the raw imported result rows make this file large
        // and it is rewritten on every debounced change.
        fs.writeFileSync(devSessionFilePath, JSON.stringify(snapshot));
    } catch (e) {}
}

function clearDevSession() {
    try {
        fs.rmSync(devSessionFilePath, { force: true });
    } catch (e) {}
}

function resolveTemplateDir(dir) {
    const templateDir = path.join(dir, 'template');
    if (fs.existsSync(templateDir)) return templateDir;
    const legacyDir = path.join(dir, 'screens');
    if (fs.existsSync(legacyDir)) return legacyDir;
    return null;
}

function loadProjectFolder(dir) {
    const projectFile = path.join(dir, 'project.json');
    if (!fs.existsSync(projectFile)) {
        return { ok: false, code: 'noprojectjson', error: 'No project.json found in folder.' };
    }
    try {
        const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));

        const orderingFile = path.join(dir, 'ordering.json');
        if (fs.existsSync(orderingFile)) {
            try {
                const ordering = JSON.parse(fs.readFileSync(orderingFile, 'utf8'));
                if (ordering && ordering.frames && project.frames) {
                    project.frames = project.frames.map(function (f) {
                        return Object.assign({}, f, { ordering: ordering.frames[f.id] || f.ordering });
                    });
                }
            } catch (e) {}
        }

        const templateDir = resolveTemplateDir(dir);
        return { ok: true, dir, project, templateDir };
    } catch (e) {
        return { ok: false, code: 'invalidjson', error: 'Invalid project.json: ' + e.message };
    }
}

function extractOrdering(project) {
    const frames = {};
    if (project.frames) {
        project.frames.forEach(function (f) {
            frames[f.id] = f.ordering || { mode: 'skills', skillNumbers: [], includeAlbertVidal: true };
        });
    }
    return { version: 1, frames: frames };
}

function stripOrdering(project) {
    if (!project || !project.frames) return project;
    const stripped = Object.assign({}, project);
    stripped.frames = project.frames.map(function (f) {
        const copy = Object.assign({}, f);
        delete copy.ordering;
        return copy;
    });
    return stripped;
}

function copyDefaultTemplate(dest) {
    const src = path.join(__dirname, 'screens');
    if (!fs.existsSync(src)) throw new Error('Default screens/ folder not found in app directory.');
    fs.cpSync(src, dest, { recursive: true });

    const imagesSrc = path.join(__dirname, 'images');
    if (fs.existsSync(imagesSrc)) {
        fs.cpSync(imagesSrc, path.join(dest, 'images'), { recursive: true });
    }
}

function setActive(dir, project, templateDir) {
    activeProjectDir = dir;
    activeProject = project;
    activeTemplateDir = templateDir;
}

// ── Window factories ──────────────────────────────────────────────────

function createControlWindow() {
    controlWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            devTools: true,
            additionalArguments: devArguments(),
        },
    });
    controlWindow.loadFile('control.html');
    controlWindow.on('closed', () => {
        controlWindow = null;
    });
}

function createStartupWindow() {
    startupWindow = new BrowserWindow({
        width: 700,
        height: 560,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            devTools: true,
            contextIsolation: true,
            additionalArguments: devArguments(),
        },
    });
    startupWindow.loadFile('startup.html');
    startupWindow.on('closed', () => {
        startupWindow = null;
    });
}

function clampToWorkArea(x, y, width, height) {
    const displays = electronScreen.getAllDisplays();
    let display = displays.find(d =>
        x >= d.bounds.x && x < d.bounds.x + d.bounds.width &&
        y >= d.bounds.y && y < d.bounds.y + d.bounds.height
    ) || electronScreen.getPrimaryDisplay();

    return clampToDisplayWorkArea(display, x, y, width, height);
}

// Clamp a window to a specific display's work area, centering it when no
// explicit x/y is supplied.
function clampToDisplayWorkArea(display, x, y, width, height) {
    const wa = display.workArea;
    const w = Math.min(width, wa.width);
    const h = Math.min(height, wa.height);
    const defaultX = wa.x + Math.round((wa.width - w) / 2);
    const defaultY = wa.y + Math.round((wa.height - h) / 2);
    const cx = Math.max(wa.x, Math.min(x != null ? x : defaultX, wa.x + wa.width - w));
    const cy = Math.max(wa.y, Math.min(y != null ? y : defaultY, wa.y + wa.height - h));
    return { x: cx, y: cy, width: w, height: h };
}

// Index (into getAllDisplays) of the display containing a screen point,
// or null when the point isn't on any display.
function displayIndexForPoint(x, y) {
    if (x == null || y == null) return null;
    const displays = electronScreen.getAllDisplays();
    for (let i = 0; i < displays.length; i++) {
        const b = displays[i].bounds;
        if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return i;
    }
    return null;
}

// Resolve which display a frame should open on from its stored monitor index.
// Falls back to the primary display (and flags it) when the index is invalid.
function resolveTargetDisplay(position) {
    const displays = electronScreen.getAllDisplays();
    const monitor = position && typeof position.monitor === 'number' ? position.monitor : 0;
    if (monitor >= 0 && displays[monitor]) {
        return { display: displays[monitor], fellBack: false };
    }
    return {
        display: electronScreen.getPrimaryDisplay(),
        fellBack: true,
        requested: monitor,
        available: displays.length
    };
}

let gridWindow = null;
let gridFrameIds = [];
let lastGridConfig = null;

function notifyControlStatus(frameId, status, reason, x, y, width, height, monitor) {
    if (controlWindow && !controlWindow.isDestroyed()) {
        const data = { frameId, status };
        if (reason) data.reason = reason;
        if (x != null && y != null) { data.x = x; data.y = y; }
        if (width != null && height != null) { data.width = width; data.height = height; }
        if (monitor != null) data.monitor = monitor;
        controlWindow.webContents.send('frames:status', data);
    }
}

// Broadcast a screen mode ('blackout' | 'logo' | 'restore') to every live
// surface: each open frame window and the grid window. This is the panic
// path — it must reach the wall regardless of which window has OS focus.
function broadcastScreenMode(mode) {
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send('screen:mode', { mode });
    });
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.webContents.send('screen:mode', { mode });
    }
    sendControlNotice('info', 'Screen mode: ' + mode);
}

function sendControlNotice(level, text) {
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('app:notice', { level: level, text: text });
    }
}

function openFrameWindow(frameId, opts) {
    const container = (opts && opts.container) || '';
    const key = frameWindowKey(frameId, container);

    const isPreview = !!(opts && opts.preview);
    const size = isPreview
        ? { width: 1280, height: 720 }
        : ((opts && opts.size) || { width: 1920, height: 1080 });
    const position = (opts && opts.position) || {};
    const goFullscreenRequested = !isPreview && opts && opts.windowed !== true;

    if (frameWindows.has(key)) {
        const existing = frameWindows.get(key);
        if (!existing.isDestroyed()) {
            // Re-apply the latest config instead of a bare focus() — otherwise a
            // config change (size/position/monitor/fullscreen) is silently
            // dropped whenever the window is already open.
            if (position.x != null && position.y != null) {
                const bounds = clampToWorkArea(position.x, position.y, size.width, size.height);
                existing.setBounds(bounds);
            } else {
                existing.setSize(size.width, size.height);
            }
            if (typeof position.kiosk === 'boolean') existing.setKiosk(!isPreview && position.kiosk);
            existing.setFullScreen(goFullscreenRequested);
            existing.focus();
            frameWindowOpts.set(key, opts || {});
            return existing;
        }
        frameWindows.delete(key);
        frameWindowOpts.delete(key);
    }

    // Resolve the assigned display from position.monitor. Preview windows open
    // windowed on that display; live windows open fullscreen on it so a single
    // action puts each frame on its projector.
    const resolved = resolveTargetDisplay(position);
    const targetDisplay = resolved.display;
    if (resolved.fellBack) {
        sendControlNotice('warning', 'Frame "' + ((opts && opts.label) || frameId) + '" is assigned to display ' +
            (resolved.requested + 1) + ', but only ' + resolved.available + ' display(s) are connected. Opening on the primary display.');
    }

    // Explicit windowed override keeps saved manual layouts working.
    const goFullscreen = goFullscreenRequested;

    let winBounds;
    if (goFullscreen) {
        const b = targetDisplay.bounds;
        winBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    } else if (position.x != null && position.y != null) {
        // Restore a previously-arranged windowed layout on whichever display
        // those coordinates fall on (honors a monitor the user dragged it to).
        winBounds = clampToWorkArea(position.x, position.y, size.width, size.height);
    } else {
        winBounds = clampToDisplayWorkArea(targetDisplay, position.x, position.y, size.width, size.height);
    }

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
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            backgroundThrottling: false,
            devTools: true,
            additionalArguments: devArguments(),
        },
    });

    win.webContents.openDevTools();

    // Live (non-preview) output must never be covered by an OS notification
    // or another app window during the show. Only while actually fullscreen,
    // though — otherwise a windowed live output (e.g. after Escape) would be
    // stuck on top of everything with no way to reach the app behind it.
    // A live window opened explicitly windowed (the dev-restart path) is not
    // pinned up front, for the same reason it un-pins on leave-full-screen:
    // otherwise it sits above every other window with no way to reach what is
    // behind it. Entering fullscreen still pins it.
    if (!isPreview) {
        if (goFullscreenRequested) win.setAlwaysOnTop(true, 'screen-saver');
        win.on('enter-full-screen', () => win.setAlwaysOnTop(true, 'screen-saver'));
        win.on('leave-full-screen', () => win.setAlwaysOnTop(false));
    }

    // Show only once the page has actually painted, and enter fullscreen only
    // after the window is placed + shown on the target display — so the
    // audience never watches the app boot, and fullscreen lands on the
    // correct monitor.
    win.once('ready-to-show', () => {
        win.show();
        if (goFullscreen) {
            win.setFullScreen(true);
        }
    });

    // Escape leaves fullscreen; Cmd/Ctrl+W closes — the 'close' handler below
    // owns the confirm-before-close logic so this and the native title-bar
    // close button behave identically.
    win.webContents.on('before-input-event', (_event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'Escape' && win.isFullScreen()) {
            win.setFullScreen(false);
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'w') {
            win.close();
        }
    });

    var labelParam = (opts && opts.label) ? '&label=' + encodeURIComponent(opts.label) : '';
    var containerParam = container ? '&container=' + encodeURIComponent(container) : '';
    var ratioParam = (opts && opts.ratio) ? '&ratio=' + encodeURIComponent(opts.ratio) : '';
    var search = 'screen=' + frameId + (isPreview ? '&preview=true' : '') + labelParam + containerParam + ratioParam;
    win.loadFile('screen.html', { search: search });
    frameWindows.set(key, win);
    frameWindowOpts.set(key, Object.assign({ frameId: frameId }, opts || {}));
    notifyControlStatus(frameId, 'connecting');

    win.webContents.on('did-finish-load', () => {
        notifyControlStatus(frameId, 'ready');
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        notifyControlStatus(frameId, 'crashed', errorDescription);
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        notifyControlStatus(frameId, 'crashed', details ? details.reason : 'render-process-gone');
    });

    win.on('unresponsive', () => {
        notifyControlStatus(frameId, 'crashed', 'unresponsive');
    });

    let lastPos = null;
    let lastSize = null;
    win.on('moved', () => { lastPos = win.getPosition(); });
    win.on('resize', () => { lastSize = win.getSize(); });

    // Confirm before closing live output, regardless of how the close was
    // triggered (native title-bar button, Cmd/Ctrl+W, OS Cmd+Q, etc.) — the
    // native title bar (added for M1's chrome fix) makes the close button a
    // real click target, so this can no longer be skipped like it could when
    // the window was frameless and only reachable via a keyboard shortcut.
    // closeFrameWindow() sets win.__forceClose before calling close() for
    // operator-confirmed closes so those don't double-prompt.
    win.on('close', (event) => {
        if (!isPreview && !win.__forceClose) {
            const choice = dialog.showMessageBoxSync(win, {
                type: 'warning',
                buttons: ['Close', 'Cancel'],
                defaultId: 1,
                cancelId: 1,
                title: 'Close live output?',
                message: 'This closes a live audience-facing window. Continue?'
            });
            if (choice !== 0) {
                event.preventDefault();
                return;
            }
        }
        // Snapshot the final windowed bounds so an arranged layout is
        // remembered even if the window was never dragged this session. Skip
        // while fullscreen (that geometry is the whole display, not a useful
        // windowed position).
        if (!win.isDestroyed() && !win.isFullScreen()) {
            lastPos = win.getPosition();
            lastSize = win.getSize();
        }
    });

    win.on('closed', () => {
        frameWindows.delete(key);
        frameWindowOpts.delete(key);
        if (lastPos) {
            const w = lastSize ? lastSize[0] : null;
            const h = lastSize ? lastSize[1] : null;
            const monitor = displayIndexForPoint(lastPos[0], lastPos[1]);
            notifyControlStatus(frameId, 'closed', null, lastPos[0], lastPos[1], w, h, monitor);
        } else {
            notifyControlStatus(frameId, 'closed');
        }
    });

    return win;
}

// Closes every window for a frame id — the bare id (normal mode) and both
// ':kv'/':state' halves (Split mode) — so closing a frame always closes all
// of its live output, not just one half.
function closeFrameWindow(frameId) {
    frameWindows.forEach((win, key) => {
        if (key !== frameId && key.indexOf(frameId + ':') !== 0) return;
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

// ── Dev session: open-window snapshot / restore ───────────────────────

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

// After electron-reloader restarts the app (a main.js or preload.js edit), go
// straight back to the project, control panel, and windows that were open. The
// control renderer restores its own state from the same snapshot — see
// js/dev-session.service.js.
// Set CEREMONATOR_NO_RESUME=1 to start at the project picker instead.
function devResume() {
    if (!isDev || process.env.CEREMONATOR_NO_RESUME === '1') return false;

    const snapshot = readDevSession();
    if (!snapshot || !snapshot.projectDir) return false;

    const loaded = loadProjectFolder(snapshot.projectDir);
    if (!loaded.ok) return false;

    setActive(snapshot.projectDir, loaded.project, loaded.templateDir);
    createControlWindow();

    const windows = snapshot.windows || [];
    if (windows.length || snapshot.grid) {
        controlWindow.webContents.once('did-finish-load', () => {
            windows.forEach(reopenFrameWindowFromSnapshot);
            if (snapshot.grid) openGridWindow(snapshot.grid);
        });
    }
    return true;
}

// ── Frame IPC handlers ────────────────────────────────────────────────

ipcMain.handle('frames:openWindow', (_event, opts) => {
    const frameId = opts && opts.frameId;
    if (!frameId) return { ok: false, error: 'frameId required' };
    openFrameWindow(frameId, opts);
    return { ok: true };
});

ipcMain.handle('frames:closeWindow', (_event, opts) => {
    const frameId = opts && opts.frameId;
    if (frameId) closeFrameWindow(frameId);
    return { ok: true };
});

ipcMain.handle('frames:closeGrid', () => {
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.close();
    }
    return { ok: true };
});

ipcMain.handle('frames:updateWindow', (_event, opts) => {
    const frameId = opts && opts.frameId;
    if (!frameId || !frameWindows.has(frameId)) return { ok: false };
    const win = frameWindows.get(frameId);
    if (win.isDestroyed()) return { ok: false };
    if (opts.size) win.setSize(opts.size.width, opts.size.height);
    if (opts.position) win.setPosition(opts.position.x, opts.position.y);
    if (typeof opts.fullscreen === 'boolean') win.setFullScreen(opts.fullscreen);
    if (typeof opts.kiosk === 'boolean') win.setKiosk(opts.kiosk);
    return { ok: true };
});

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
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.__forceClose = true;
        gridWindow.close();
    }
    gridWindow = null;
    gridFrameIds = [];

    const totalWidth  = grid.cols * frameSize.width  + (grid.cols - 1) * gap;
    const totalHeight = grid.rows * frameSize.height + (grid.rows - 1) * gap;

    const primary = electronScreen.getPrimaryDisplay();
    // Clamp the grid window to the work area and compute a uniform scale so
    // cells shrink to fit instead of spilling off-screen unmovable/unscrollable.
    const clamped = clampToDisplayWorkArea(primary, null, null, totalWidth, totalHeight);
    const scale = Math.min(1, clamped.width / totalWidth, clamped.height / totalHeight);

    // Passed as a single JSON blob (not delimiter-joined tokens) so a frame
    // label can contain any character without colliding with the encoding.
    const cellsPayload = frames.map(f => ({
        frameId: f.frameId,
        container: f.container || '',
        ratio: f.ratio || '',
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
            preload: path.join(__dirname, 'preload.js'),
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
    win.webContents.on('before-input-event', (_event, input) => {
        if (input.type !== 'keyDown') return;
        if ((input.control || input.meta) && input.key.toLowerCase() === 'w') {
            win.close();
        }
    });

    // Confirm before closing, regardless of how the close was triggered
    // (native title-bar button, Cmd/Ctrl+W, OS Cmd+Q, etc.) — see the matching
    // frame-window guard above for why this can no longer be skipped now that
    // the window has a real title bar. The pre-emptive close at the top of
    // this handler, frames:closeGrid, and app:exitToStartup all set
    // win.__forceClose first so those don't double-prompt.
    win.on('close', (event) => {
        if (!win.__forceClose) {
            const choice = dialog.showMessageBoxSync(win, {
                type: 'warning',
                buttons: ['Close', 'Cancel'],
                defaultId: 1,
                cancelId: 1,
                title: 'Close grid view?',
                message: 'This closes the grid view. Any frame with its own independent live window is unaffected.'
            });
            if (choice !== 0) event.preventDefault();
        }
    });

    win.webContents.on('did-finish-load', () => {
        // Only report status for frames that don't have their own live window —
        // overwriting an independent window's status would desync the operator panel.
        gridFrameIds.forEach(fId => {
            if (!frameWindows.has(fId)) notifyControlStatus(fId, 'ready');
        });
    });

    win.on('closed', () => {
        // Guard against a stale closure: if a newer grid window has already
        // replaced this one, this handler must not touch the current state.
        if (gridWindow !== win) return;
        gridFrameIds.forEach(fId => {
            if (!frameWindows.has(fId)) notifyControlStatus(fId, 'closed');
        });
        gridWindow = null;
        gridFrameIds = [];
        lastGridConfig = null;
    });

    return { ok: true };
}

ipcMain.handle('frames:openLarge', (_event, config) => openGridWindow(config));

ipcMain.handle('frames:getPositions', () => {
    const result = {};
    frameWindows.forEach((win, frameId) => {
        if (!win.isDestroyed()) {
            const [x, y] = win.getPosition();
            const [width, height] = win.getSize();
            result[frameId] = { x, y, width, height, monitor: displayIndexForPoint(x, y) };
        }
    });
    return result;
});

// Which frames currently have an open window. Lets a renderer that started
// *after* the windows did (the dev-restart path) reconcile its status badges,
// since those windows' 'connecting'/'ready' notices arrived too early to land.
ipcMain.handle('frames:openIds', () => {
    const ids = [];
    frameWindows.forEach((win, key) => {
        if (win.isDestroyed()) return;
        const frameId = key.split(':')[0];
        if (ids.indexOf(frameId) < 0) ids.push(frameId);
    });
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridFrameIds.forEach((frameId) => {
            if (ids.indexOf(frameId) < 0) ids.push(frameId);
        });
    }
    return ids;
});

ipcMain.handle('flags:list', () => {
    try {
        const dir = path.join(__dirname, 'data', 'flags');
        return fs.readdirSync(dir)
            .filter((f) => /\.png$/i.test(f))
            .map((f) => f.replace(/\.png$/i, ''));
    } catch (e) {
        return [];
    }
});

ipcMain.handle('displays:list', () => {
    return electronScreen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: 'Display ' + (i + 1),
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
    }));
});

// ── Legacy project IPC handlers (kept for safety) ─────────────────────

ipcMain.handle('project:save', (_event, { project }) => {
    try {
        fs.writeFileSync(projectFilePath, JSON.stringify(project, null, 2));
        fs.writeFileSync(configFilePath, JSON.stringify({ lastProject: projectFilePath }));
        return { ok: true, path: projectFilePath };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('project:load', (_event, { path: filePath }) => {
    try {
        const p = filePath || (() => {
            if (fs.existsSync(configFilePath)) {
                const cfg = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
                return cfg.lastProject;
            }
            return null;
        })();
        if (!p || !fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        return null;
    }
});

ipcMain.handle('project:saveDialog', async (_event, { project }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Project',
        defaultPath: path.join(userDataPath, 'project.json'),
        filters: [{ name: 'Ceremonator Project', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
        fs.writeFileSync(filePath, JSON.stringify(project, null, 2));
        fs.writeFileSync(configFilePath, JSON.stringify({ lastProject: filePath }));
        return { ok: true, path: filePath };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('project:loadDialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Load Project',
        defaultPath: userDataPath,
        filters: [{ name: 'Ceremonator Project', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return null;
    try {
        const filePath = filePaths[0];
        fs.writeFileSync(configFilePath, JSON.stringify({ lastProject: filePath }));
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
});

// ── Folder-based project IPC handlers ────────────────────────────────

ipcMain.handle('project:recent', () => {
    const cfg = readConfig();
    return cfg.recentProjects || [];
});

ipcMain.handle('project:removeRecent', (_event, opts) => {
    const dir = opts && opts.dir;
    if (!dir) return { ok: false };
    const cfg = readConfig();
    cfg.recentProjects = (cfg.recentProjects || []).filter(function (r) { return r.path !== dir; });
    if (cfg.lastProject === dir) delete cfg.lastProject;
    writeConfig(cfg);
    return { ok: true, recentProjects: cfg.recentProjects };
});

ipcMain.handle('project:create', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Choose Project Folder',
        properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { canceled: true };
    const dir = filePaths[0];

    try {
        fs.accessSync(dir, fs.constants.W_OK);
    } catch (e) {
        return { ok: false, error: 'Folder is not writable: ' + dir };
    }

    const existingProjectFile = path.join(dir, 'project.json');
    if (fs.existsSync(existingProjectFile)) {
        const { response } = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Overwrite', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Project exists',
            message: 'This folder already contains a project.json. Overwrite it?'
        });
        if (response !== 0) return { canceled: true };
    }

    try {
        const templateDest = path.join(dir, 'template');
        if (!fs.existsSync(templateDest)) {
            copyDefaultTemplate(templateDest);
        }

        const defaultOrdering = {
            version: 1,
            frames: { a: { mode: 'skills', skillNumbers: [], includeAlbertVidal: true } }
        };
        fs.writeFileSync(path.join(dir, 'ordering.json'), JSON.stringify(defaultOrdering, null, 2));

        const project = {
            version: 2,
            name: path.basename(dir),
            displayMode: 'windows',
            frames: [{
                id: 'a',
                label: 'Main Stage',
                size: { width: 1920, height: 1080 },
                position: { monitor: 0, x: null, y: null, fullscreen: false, kiosk: false },
                ordering: { mode: 'skills', skillNumbers: [], includeAlbertVidal: true }
            }]
        };
        fs.writeFileSync(existingProjectFile, JSON.stringify(stripOrdering(project), null, 2));

        setActive(dir, project, templateDest);
        addRecent(dir, project.name);
        return { ok: true, dir, project };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('project:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Open Project Folder',
        properties: ['openDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { canceled: true };
    const dir = filePaths[0];

    const loaded = loadProjectFolder(dir);
    if (!loaded.ok) {
        await dialog.showMessageBox({
            type: 'error',
            title: 'Cannot open project',
            message: loaded.error
        });
        return { ok: false, error: loaded.error };
    }

    let templateDir = loaded.templateDir;
    if (!templateDir) {
        const { response } = await dialog.showMessageBox({
            type: 'question',
            buttons: ['Copy default templates', 'Skip'],
            defaultId: 0,
            title: 'Templates missing',
            message: 'This project has no template/ folder. Copy default templates from the app?'
        });
        if (response === 0) {
            try {
                const templateDest = path.join(dir, 'template');
                copyDefaultTemplate(templateDest);
                templateDir = templateDest;
            } catch (e) {
                await dialog.showMessageBox({ type: 'error', title: 'Copy failed', message: e.message });
            }
        }
    }

    setActive(dir, loaded.project, templateDir);
    addRecent(dir, loaded.project.name || path.basename(dir));
    return { ok: true, dir, project: loaded.project };
});

ipcMain.handle('project:openPath', async (_event, { dir }) => {
    if (!dir || !fs.existsSync(dir)) return { ok: false, code: 'missing', error: 'Path no longer exists.' };

    const loaded = loadProjectFolder(dir);
    if (!loaded.ok) return { ok: false, code: loaded.code, error: loaded.error };

    let templateDir = loaded.templateDir;
    if (!templateDir) {
        const { response } = await dialog.showMessageBox({
            type: 'question',
            buttons: ['Copy default templates', 'Skip'],
            defaultId: 0,
            title: 'Templates missing',
            message: 'This project has no template/ folder. Copy default templates from the app?'
        });
        if (response === 0) {
            try {
                const templateDest = path.join(dir, 'template');
                copyDefaultTemplate(templateDest);
                templateDir = templateDest;
            } catch (e) {}
        }
    }

    setActive(dir, loaded.project, templateDir);
    addRecent(dir, loaded.project.name || path.basename(dir));
    return { ok: true, dir, project: loaded.project };
});

ipcMain.handle('project:current', () => {
    if (!activeProjectDir || !activeProject) return { dir: null, project: null };
    return { dir: activeProjectDir, project: activeProject };
});

ipcMain.handle('project:saveCurrent', (_event, project) => {
    if (!activeProjectDir) return { ok: false, error: 'No active project open.' };
    try {
        fs.writeFileSync(path.join(activeProjectDir, 'ordering.json'), JSON.stringify(extractOrdering(project), null, 2));
        const stripped = stripOrdering(project);
        fs.writeFileSync(path.join(activeProjectDir, 'project.json'), JSON.stringify(stripped, null, 2));
        activeProject = project;
        if (project.name) addRecent(activeProjectDir, project.name);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('project:saveAs', async (_event, project) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Save Project As — Choose Folder',
        properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { canceled: true };
    const dir = filePaths[0];

    try {
        fs.accessSync(dir, fs.constants.W_OK);
    } catch (e) {
        return { ok: false, error: 'Folder is not writable: ' + dir };
    }

    try {
        const templateDest = path.join(dir, 'template');
        if (!fs.existsSync(templateDest)) {
            if (activeTemplateDir && fs.existsSync(activeTemplateDir)) {
                fs.cpSync(activeTemplateDir, templateDest, { recursive: true });
            } else {
                copyDefaultTemplate(templateDest);
            }
        }

        fs.writeFileSync(path.join(dir, 'ordering.json'), JSON.stringify(extractOrdering(project), null, 2));
        const strippedSaveAs = stripOrdering(project);
        fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(strippedSaveAs, null, 2));
        setActive(dir, project, templateDest);
        addRecent(dir, project.name || path.basename(dir));
        return { ok: true, dir };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// ── App IPC handlers ──────────────────────────────────────────────────

ipcMain.handle('app:openControl', () => {
    createControlWindow();
    if (startupWindow && !startupWindow.isDestroyed()) {
        startupWindow.close();
    }
    return { ok: true };
});

ipcMain.handle('app:reloadScreens', () => {
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) win.webContents.reload();
    });
    return { ok: true };
});

ipcMain.handle('app:reloadScreen', (_event, opts) => {
    const frameId = opts && opts.frameId;
    if (!frameId || !frameWindows.has(frameId)) return { ok: false };
    const win = frameWindows.get(frameId);
    if (win.isDestroyed()) return { ok: false };
    notifyControlStatus(frameId, 'connecting');
    win.webContents.reload();
    return { ok: true };
});

// Panic path — same handler the global keyboard shortcuts call, exposed to
// the control panel toolbar (see K4) so the operator can trigger it with the
// mouse too.
ipcMain.handle('screen:setMode', (_event, opts) => {
    const mode = opts && opts.mode;
    if (!mode) return { ok: false, error: 'mode required' };
    broadcastScreenMode(mode);
    return { ok: true };
});

// ── Dev session IPC (development only) ────────────────────────────────

ipcMain.handle('dev:saveSession', (_event, control) => {
    if (!isDev) return { ok: false };
    writeDevSession({
        version: DEV_SESSION_VERSION,
        savedAt: new Date().toISOString(),
        projectDir: activeProjectDir,
        control: control || null,
        windows: serializeOpenFrameWindows(),
        grid: (gridWindow && !gridWindow.isDestroyed()) ? lastGridConfig : null
    });
    return { ok: true };
});

ipcMain.handle('dev:loadSession', () => {
    if (!isDev) return null;
    const snapshot = readDevSession();
    if (!snapshot) return null;
    // A snapshot only means anything for the project it was taken in.
    if (!activeProjectDir || snapshot.projectDir !== activeProjectDir) return null;
    return snapshot.control || null;
});

ipcMain.handle('dev:clearSession', () => {
    clearDevSession();
    return { ok: true };
});

ipcMain.handle('app:exitToStartup', () => {
    // The operator already confirmed via the control panel's own confirm()
    // before invoking this — skip each window's 'close' handler dialog.
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.__forceClose = true;
            win.close();
        }
    });
    frameWindows.clear();
    frameWindowOpts.clear();
    // Leaving the project deliberately is a clean slate: don't let the next dev
    // launch resume back into it.
    clearDevSession();
    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.__forceClose = true;
        gridWindow.close();
    }
    createStartupWindow();
    if (controlWindow && !controlWindow.isDestroyed()) controlWindow.close();
    return { ok: true };
});

// ── App lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(() => {
    protocol.registerFileProtocol('wstemplate', (request, cb) => {
        const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');

        // Use the project template dir, falling back to bundled screens/ when no
        // project template was copied (e.g. operator clicked "Skip" on a template-less project).
        // CEREMONATOR_DEFAULT_TEMPLATE=1 (dev only) forces the bundled folder so
        // template edits in the repo are visible without re-copying them.
        const bundledTemplateDir = path.join(__dirname, 'screens');
        const effectiveTemplateDir = forceDefaultTemplate
            ? bundledTemplateDir
            : (activeTemplateDir || bundledTemplateDir);
        const templatePath = path.normalize(path.join(effectiveTemplateDir, rel));
        const templateBase = path.normalize(effectiveTemplateDir);
        const safe = templatePath === templateBase || templatePath.startsWith(templateBase + path.sep);
        if (safe && fs.existsSync(templatePath)) {
            return cb({ path: templatePath });
        }

        // Fall back to app root for shared assets (images/, data/flags/, fonts/, etc.)
        const appPath = path.normalize(path.join(__dirname, rel));
        const appBase = path.normalize(__dirname);
        if (appPath !== appBase && !appPath.startsWith(appBase + path.sep)) {
            return cb({ error: -6 });
        }
        cb({ path: appPath });
    });

    Menu.setApplicationMenu(null);
    if (forceDefaultTemplate) {
        console.log('[dev] CEREMONATOR_DEFAULT_TEMPLATE=1 — serving templates from the bundled screens/ folder.');
    }
    // In dev, resume the project/windows a hot restart just tore down.
    if (!devResume()) {
        createStartupWindow();
    }
    app.setAboutPanelOptions({ applicationName: 'Ceremonator' });

    // Panic-path accelerators. Read from config.json (key "shortcuts") so a
    // venue whose accelerators collide with OBS/vMix can override them
    // without a rebuild — see LIVE_FEED_KANBAN.md.
    const shortcuts = Object.assign({
        blackout: 'CommandOrControl+Alt+B',
        logo: 'CommandOrControl+Alt+L',
        restore: 'CommandOrControl+Alt+R'
    }, readConfig().shortcuts || {});

    Object.keys(shortcuts).forEach((mode) => {
        const accelerator = shortcuts[mode];
        if (!accelerator) return;
        const ok = globalShortcut.register(accelerator, () => broadcastScreenMode(mode));
        if (!ok) {
            sendControlNotice('warning', 'Could not register the "' + mode + '" shortcut (' + accelerator +
                '). It may already be in use by another application.');
        }
    });

    electronScreen.on('display-removed', () => {
        frameWindows.forEach((win, frameId) => {
            if (!win.isDestroyed()) {
                const [wx, wy] = win.getPosition();
                const [ww, wh] = win.getSize();
                const clamped = clampToWorkArea(wx, wy, ww, wh);
                win.setBounds(clamped);
            }
        });
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) win.destroy();
    });
    frameWindows.clear();
});

try {
    require('electron-reloader')(module);
} catch {}
