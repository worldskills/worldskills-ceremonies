const { contextBridge, ipcRenderer } = require('electron');

// Injected by main.js via webPreferences.additionalArguments, so the renderer
// can read the dev flags synchronously during startup.
const isDev = process.argv.includes('--ceremonator-dev');
const forceDefaultTemplate = process.argv.includes('--ceremonator-default-templates');

contextBridge.exposeInMainWorld('ceremonator', {
    frames: {
        openWindow: (opts) => ipcRenderer.invoke('frames:openWindow', opts),
        closeWindow: (opts) => ipcRenderer.invoke('frames:closeWindow', opts),
        openLargeWindow: (config) => ipcRenderer.invoke('frames:openLarge', config),
        closeGrid: () => ipcRenderer.invoke('frames:closeGrid'),
        updateWindow: (opts) => ipcRenderer.invoke('frames:updateWindow', opts),
        getPositions: () => ipcRenderer.invoke('frames:getPositions'),
        openIds: () => ipcRenderer.invoke('frames:openIds'),
    },
    screen: {
        setMode: (mode) => ipcRenderer.invoke('screen:setMode', { mode }),
    },
    displays: {
        list: () => ipcRenderer.invoke('displays:list'),
    },
    flags: {
        list: () => ipcRenderer.invoke('flags:list'),
    },
    project: {
        save: (project) => ipcRenderer.invoke('project:save', { project }),
        load: (path) => ipcRenderer.invoke('project:load', { path }),
        saveDialog: (project) => ipcRenderer.invoke('project:saveDialog', { project }),
        loadDialog: () => ipcRenderer.invoke('project:loadDialog'),
        recent: () => ipcRenderer.invoke('project:recent'),
        removeRecent: (dir) => ipcRenderer.invoke('project:removeRecent', { dir }),
        create: () => ipcRenderer.invoke('project:create'),
        open: () => ipcRenderer.invoke('project:open'),
        openPath: (opts) => ipcRenderer.invoke('project:openPath', opts),
        current: () => ipcRenderer.invoke('project:current'),
        saveCurrent: (project) => ipcRenderer.invoke('project:saveCurrent', project),
        saveAs: (project) => ipcRenderer.invoke('project:saveAs', project),
    },
    dev: {
        isDev: isDev,
        forceDefaultTemplate: forceDefaultTemplate,
        loadSession: () => ipcRenderer.invoke('dev:loadSession'),
        saveSession: (control) => ipcRenderer.invoke('dev:saveSession', control),
        clearSession: () => ipcRenderer.invoke('dev:clearSession'),
    },
    app: {
        openControl: () => ipcRenderer.invoke('app:openControl'),
        reloadScreens: () => ipcRenderer.invoke('app:reloadScreens'),
        reloadScreen: (frameId) => ipcRenderer.invoke('app:reloadScreen', { frameId }),
        exitToStartup: () => ipcRenderer.invoke('app:exitToStartup'),
    },
    onFrameStatus: (callback) => {
        ipcRenderer.on('frames:status', (_event, data) => callback(data));
    },
    onScreenMode: (callback) => {
        ipcRenderer.on('screen:mode', (_event, data) => callback(data));
    },
    onNotice: (callback) => {
        ipcRenderer.on('app:notice', (_event, data) => callback(data));
    },
});
