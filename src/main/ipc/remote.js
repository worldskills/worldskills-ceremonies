const { ipcMain } = require('electron');
const appWindows = require('../app-windows');
const remoteServer = require('../remote-server');
const projectStore = require('../project-store');
const { hasRole } = require('./sender-role');

function registerRemoteIpc() {
    ipcMain.handle('remote:openOperator', async (event, frameId) => {
        if (!hasRole(event, ['control'])) {
            return { ok: false, error: 'Forbidden sender' };
        }

        const info = remoteServer.getInfo();
        if (!info.port) {
            return { ok: false, error: 'Enable the remote server before opening Operator.' };
        }

        const url =
            'http://127.0.0.1:' +
            info.port +
            '/operator?frame=' +
            encodeURIComponent(frameId || '') +
            '#pin=' +
            info.pin;

        try {
            await appWindows.createOperatorWindow(url);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.on('remote:commandResult', (event, requestId, result) => {
        if (hasRole(event, ['control']) && typeof requestId === 'string') {
            remoteServer.completeCommand(requestId, result);
        }
    });

    ipcMain.handle('remote:info', (event) => {
        if (!hasRole(event, ['control'])) {
            return { pin: null, urls: [] };
        }
        return remoteServer.getInfo();
    });

    ipcMain.handle('remote:configure', (event, config) => {
        if (!hasRole(event, ['control'])) {
            return { ok: false, error: 'Forbidden sender' };
        }

        const pin = String(config && config.pin != null ? config.pin : '').trim();
        const port = Number(config && config.port);
        if (!/^\d{6}$/.test(pin)) {
            return { ok: false, error: 'PIN must contain exactly 6 digits.' };
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return { ok: false, error: 'Port must be between 1 and 65535.' };
        }

        const dir = projectStore.getActiveProjectDir();
        const project = projectStore.getActiveProject();
        if (!dir || !project) {
            return { ok: false, error: 'No active project open.' };
        }

        try {
            const nextProject = Object.assign({}, project, {
                remote: {
                    enabled: !config || config.enabled !== false,
                    pin: pin,
                    port: port,
                },
            });
            projectStore.writeProjectFiles(dir, nextProject);
            projectStore.setActiveProject(nextProject);
            remoteServer.applyRemoteConfig(nextProject);
            return { ok: true, config: nextProject.remote, info: remoteServer.getInfo() };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.on('remote:sync', (event, snapshot) => {
        // Version 2 feed-aware snapshots are objects; retain the legacy array
        // shape so an older control renderer can still drive the remote page.
        const shaped = Array.isArray(snapshot) || (snapshot && Array.isArray(snapshot.frames));
        if (hasRole(event, ['control']) && shaped) {
            remoteServer.broadcastState(snapshot);
        }
    });
}

module.exports = { registerRemoteIpc };
