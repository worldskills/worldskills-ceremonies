const { ipcMain } = require('electron');

// Pushed eagerly rather than read on demand, since a BrowserWindow close handler
// is synchronous and cannot await an IPC round-trip.
let lastKnownDirty = false;

function registerProjectDirtyIpc() {
    ipcMain.on('project:setDirty', (_event, dirty) => {
        lastKnownDirty = !!dirty;
    });
}

function isProjectDirty() {
    return lastKnownDirty;
}

module.exports = { registerProjectDirtyIpc, isProjectDirty };
