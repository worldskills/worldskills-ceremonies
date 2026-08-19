const { getControlWindow } = require('./app-windows');

function notifyFrameStatus(frameId, status, extra) {
    const win = getControlWindow();
    if (win && !win.isDestroyed()) {
        const e = extra || {};

        const data = {
            frameId,
            status
        };

        if (e.reason) data.reason = e.reason;

        if (e.x != null && e.y != null) {
            data.x = e.x;
            data.y = e.y;
        }

        if (e.width != null && e.height != null) {
            data.width = e.width;
            data.height = e.height;
        }

        if (e.monitor != null) {
            data.monitor = e.monitor;
        }

        if (e.windows) {
            data.windows = e.windows;
        }
        win.webContents.send('frames:status', data);
    }
}

function sendControlNotice(level, text) {
    const win = getControlWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send('app:notice', { level: level, text: text });
    }
}

function sendRemoteAction(action) {
    const win = getControlWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send('remote:action', action);
    }
}

function requestClearAllData() {
    const win = getControlWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send('session:clearRequested');
    }
}

module.exports = { notifyFrameStatus, sendControlNotice, sendRemoteAction, requestClearAllData };
