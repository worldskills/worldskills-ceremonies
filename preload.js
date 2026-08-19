const { contextBridge, ipcRenderer } = require('electron');

// Injected by main.js via webPreferences.additionalArguments — lets the renderer read dev flags synchronously at startup.
const isDev = process.argv.includes('--ceremonator-dev');
const roleArg = process.argv.find((arg) => arg.indexOf('--ceremonator-role=') === 0);
const role = roleArg ? roleArg.split('=')[1] : 'output';

const fullApi = {
    frames: {
        openWindow: (opts) => ipcRenderer.invoke('frames:openWindow', opts),
        closeWindow: (opts) => ipcRenderer.invoke('frames:closeWindow', opts),
        openLargeWindow: (config) => ipcRenderer.invoke('frames:openLarge', config),
        getPositions: () => ipcRenderer.invoke('frames:getPositions'),
        openIds: () => ipcRenderer.invoke('frames:openIds'),
    },
    grid: {
        template: () => ipcRenderer.invoke('grid:template'),
        fit: (size) => ipcRenderer.invoke('grid:fit', size),
    },
    displays: {
        list: () => ipcRenderer.invoke('displays:list'),
    },
    flags: {
        list: () => ipcRenderer.invoke('flags:list'),
    },
    project: {
        recent: () => ipcRenderer.invoke('project:recent'),
        bundled: () => ipcRenderer.invoke('project:bundled'),
        removeRecent: (dir) => ipcRenderer.invoke('project:removeRecent', { dir }),
        create: () => ipcRenderer.invoke('project:create'),
        open: () => ipcRenderer.invoke('project:open'),
        openPath: (opts) => ipcRenderer.invoke('project:openPath', opts),
        current: () => ipcRenderer.invoke('project:current'),
        saveCurrent: (project) => ipcRenderer.invoke('project:saveCurrent', project),
        saveAs: (project) => ipcRenderer.invoke('project:saveAs', project),
        readTranslations: () => ipcRenderer.invoke('project:readTranslations'),
        writeTranslations: (languages) => ipcRenderer.invoke('project:writeTranslations', languages),
        setDirty: (dirty) => ipcRenderer.send('project:setDirty', !!dirty),
    },
    dev: {
        isDev: isDev,
        loadSession: () => ipcRenderer.invoke('dev:loadSession'),
        saveSession: (control) => ipcRenderer.invoke('dev:saveSession', control),
        clearSession: () => ipcRenderer.invoke('dev:clearSession'),
    },
    app: {
        openControl: () => ipcRenderer.invoke('app:openControl'),
        reloadScreen: (frameId) => ipcRenderer.invoke('app:reloadScreen', { frameId }),
    },
    remote: {
        info: () => ipcRenderer.invoke('remote:info'),
        sync: (snapshot) => ipcRenderer.send('remote:sync', snapshot),
        onAction: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('remote:action', listener);
            return () => ipcRenderer.removeListener('remote:action', listener);
        },
    },
    onFrameStatus: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('frames:status', listener);
        return () => ipcRenderer.removeListener('frames:status', listener);
    },
    onNotice: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('app:notice', listener);
        return () => ipcRenderer.removeListener('app:notice', listener);
    },
    onClearAllDataRequested: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('session:clearRequested', listener);
        return () => ipcRenderer.removeListener('session:clearRequested', listener);
    },
};

const startupApi = {
    project: fullApi.project,
    app: { openControl: fullApi.app.openControl }
};
const outputApi = {
    project: {
        current: fullApi.project.current,
        readTranslations: fullApi.project.readTranslations
    },
    // Only the grid window itself gets past grid:fit's sender check; screen windows share this role.
    grid: fullApi.grid
};

contextBridge.exposeInMainWorld('ceremonator', role === 'control' ? fullApi : (role === 'startup' ? startupApi : outputApi));
