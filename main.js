const { app, dialog, Menu, BrowserWindow, ipcMain, screen: electronScreen, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

if (require('electron-squirrel-startup')) {
    app.quit();
}

// Must be called before app.whenReady
protocol.registerSchemesAsPrivileged([{
    scheme: 'wstemplate',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

const frameWindows = new Map();
let controlWindow = null;
let startupWindow = null;

let activeProjectDir = null;
let activeTemplateDir = null;
let activeProject = null;

const userDataPath = app.getPath('userData');
const projectFilePath = path.join(userDataPath, 'project.json');
const configFilePath = path.join(userDataPath, 'config.json');

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
        const templateDir = resolveTemplateDir(dir);
        return { ok: true, dir, project, templateDir };
    } catch (e) {
        return { ok: false, code: 'invalidjson', error: 'Invalid project.json: ' + e.message };
    }
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
            contextIsolation: true,
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

function sendControlNotice(level, text) {
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('app:notice', { level: level, text: text });
    }
}

function openFrameWindow(frameId, opts) {
    if (frameWindows.has(frameId)) {
        const existing = frameWindows.get(frameId);
        if (!existing.isDestroyed()) {
            existing.focus();
            return existing;
        }
        frameWindows.delete(frameId);
    }

    const isPreview = !!(opts && opts.preview);
    const size = isPreview
        ? { width: 1280, height: 720 }
        : ((opts && opts.size) || { width: 1920, height: 1080 });
    const position = (opts && opts.position) || {};

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
    const goFullscreen = !isPreview && opts && opts.windowed !== true;

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
        fullscreen: false,
        kiosk: (!isPreview && position.kiosk) || false,
        frame: false,
        backgroundColor: '#2E1651',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });

    // Enter fullscreen after the window is placed on the target display so the
    // OS fullscreens it on the correct monitor.
    if (goFullscreen) {
        win.setFullScreen(true);
    }

    var labelParam = (opts && opts.label) ? '&label=' + encodeURIComponent(opts.label) : '';
    var search = 'screen=' + frameId + (opts && opts.preview ? '&preview=true' : '') + labelParam;
    win.loadFile('screen.html', { search: search });
    frameWindows.set(frameId, win);
    notifyControlStatus(frameId, 'connecting');

    win.webContents.on('did-finish-load', () => {
        notifyControlStatus(frameId, 'ready');
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        notifyControlStatus(frameId, 'crashed', errorDescription);
    });

    win.on('unresponsive', () => {
        notifyControlStatus(frameId, 'crashed', 'unresponsive');
    });

    let lastPos = null;
    let lastSize = null;
    win.on('moved', () => { lastPos = win.getPosition(); });
    win.on('resize', () => { lastSize = win.getSize(); });

    // Snapshot the final windowed bounds so an arranged layout is remembered
    // even if the window was never dragged this session. Skip while fullscreen
    // (that geometry is the whole display, not a useful windowed position).
    win.on('close', () => {
        if (!win.isDestroyed() && !win.isFullScreen()) {
            lastPos = win.getPosition();
            lastSize = win.getSize();
        }
    });

    win.on('closed', () => {
        frameWindows.delete(frameId);
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

function closeFrameWindow(frameId) {
    if (frameWindows.has(frameId)) {
        const win = frameWindows.get(frameId);
        if (!win.isDestroyed()) {
            // A frameless window in native fullscreen can fail to close on
            // macOS; leave fullscreen first so close() reliably takes effect.
            if (win.isFullScreen()) win.setFullScreen(false);
            win.close();
        }
        frameWindows.delete(frameId);
    }
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

ipcMain.handle('frames:openLarge', (_event, config) => {
    const frames = config.frames || [];
    const grid = config.grid || { cols: 2, rows: 1, gap: 0 };
    const frameSize = config.frameSize || { width: 1100, height: 500 };
    const gap = grid.gap || 0;

    const totalWidth  = grid.cols * frameSize.width  + (grid.cols - 1) * gap;
    const totalHeight = grid.rows * frameSize.height + (grid.rows - 1) * gap;

    const primary = electronScreen.getPrimaryDisplay();
    const wa = primary.workArea;

    const frameIds = frames.map(f => f.frameId).join(',');

    const win = new BrowserWindow({
        width: totalWidth,
        height: totalHeight,
        x: wa.x,
        y: wa.y,
        frame: false,
        backgroundColor: '#000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });

    if (gridWindow && !gridWindow.isDestroyed()) {
        gridWindow.close();
    }
    gridWindow = win;
    gridFrameIds = frames.map(f => f.frameId);

    win.loadFile('frames.html', {
        search: [
            'frames=' + encodeURIComponent(frameIds),
            'cols=' + grid.cols,
            'rows=' + grid.rows,
            'frameW=' + frameSize.width,
            'frameH=' + frameSize.height,
            'gap=' + gap,
        ].join('&')
    });

    win.webContents.on('did-finish-load', () => {
        gridFrameIds.forEach(fId => notifyControlStatus(fId, 'ready'));
    });

    win.on('closed', () => {
        gridFrameIds.forEach(fId => notifyControlStatus(fId, 'closed'));
        gridWindow = null;
        gridFrameIds = [];
    });

    return { ok: true };
});

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
        fs.writeFileSync(existingProjectFile, JSON.stringify(project, null, 2));

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
        const projectFile = path.join(activeProjectDir, 'project.json');
        fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
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

        const projectFile = path.join(dir, 'project.json');
        fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
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

ipcMain.handle('app:exitToStartup', () => {
    frameWindows.forEach((win) => { if (!win.isDestroyed()) win.close(); });
    frameWindows.clear();
    if (gridWindow && !gridWindow.isDestroyed()) gridWindow.close();
    createStartupWindow();
    if (controlWindow && !controlWindow.isDestroyed()) controlWindow.close();
    return { ok: true };
});

// ── App lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(() => {
    protocol.registerFileProtocol('wstemplate', (request, cb) => {
        const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');

        // Try project template dir first (project-specific overrides)
        if (activeTemplateDir) {
            const templatePath = path.normalize(path.join(activeTemplateDir, rel));
            const templateBase = path.normalize(activeTemplateDir);
            const safe = templatePath === templateBase || templatePath.startsWith(templateBase + path.sep);
            if (safe && fs.existsSync(templatePath)) {
                return cb({ path: templatePath });
            }
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
    createStartupWindow();
    app.setAboutPanelOptions({ applicationName: 'Ceremonator' });

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
    frameWindows.forEach((win) => {
        if (!win.isDestroyed()) win.destroy();
    });
    frameWindows.clear();
});

try {
    require('electron-reloader')(module);
} catch {}
