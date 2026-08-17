const { ipcMain } = require('electron');
const remoteServer = require('../remote-server');
const { hasRole } = require('./sender-role');

function registerRemoteIpc() {
    ipcMain.handle('remote:info', (event) => hasRole(event, ['control']) ? remoteServer.getInfo() : { pin: null, urls: [] });
    ipcMain.on('remote:sync', (event, snapshot) => {
        if (hasRole(event, ['control']) && Array.isArray(snapshot)) remoteServer.broadcastState(snapshot);
    });
}

module.exports = { registerRemoteIpc };
