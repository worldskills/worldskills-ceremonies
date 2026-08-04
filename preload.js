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
        getPositions: () => ipcRenderer.invoke('frames:getPositions'),
        openIds: () => ipcRenderer.invoke('frames:openIds'),
    },
    displays: {
        list: () => ipcRenderer.invoke('displays:list'),
    },
    flags: {
        list: () => ipcRenderer.invoke('flags:list'),
    },
    project: {
        recent: () => ipcRenderer.invoke('project:recent'),
        removeRecent: (dir) => ipcRenderer.invoke('project:removeRecent', { dir }),
        create: () => ipcRenderer.invoke('project:create'),
        open: () => ipcRenderer.invoke('project:open'),
        openPath: (opts) => ipcRenderer.invoke('project:openPath', opts),
        current: () => ipcRenderer.invoke('project:current'),
        saveCurrent: (project) => ipcRenderer.invoke('project:saveCurrent', project),
        saveAs: (project) => ipcRenderer.invoke('project:saveAs', project),
        readTranslations: () => ipcRenderer.invoke('project:readTranslations'),
        writeTranslations: (languages) => ipcRenderer.invoke('project:writeTranslations', languages),
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
        reloadScreen: (frameId) => ipcRenderer.invoke('app:reloadScreen', { frameId }),
        exitToStartup: () => ipcRenderer.invoke('app:exitToStartup'),
    },
    onFrameStatus: (callback) => {
        ipcRenderer.on('frames:status', (_event, data) => callback(data));
    },
    onNotice: (callback) => {
        ipcRenderer.on('app:notice', (_event, data) => callback(data));
    },
});
