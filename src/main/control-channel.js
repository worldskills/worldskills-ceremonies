const { getControlWindow } = require('./app-windows');

// Wire payload (frames:status) keeps these as flat top-level keys, matching the pre-refactor 8-positional-param API.
function notifyFrameStatus(frameId, status, extra) {
    const win = getControlWindow();
    if (win && !win.isDestroyed()) {
        const e = extra || {};
        const data = { frameId, status };
        if (e.reason) data.reason = e.reason;
        if (e.x != null && e.y != null) { data.x = e.x; data.y = e.y; }
        if (e.width != null && e.height != null) { data.width = e.width; data.height = e.height; }
        if (e.monitor != null) data.monitor = e.monitor;
        win.webContents.send('frames:status', data);
    }
}

function sendControlNotice(level, text) {
    const win = getControlWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send('app:notice', { level: level, text: text });
    }
}

module.exports = { notifyFrameStatus, sendControlNotice };
