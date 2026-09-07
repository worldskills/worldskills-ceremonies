const { app, screen } = require('electron');

if (require('electron-squirrel-startup')) {
    app.quit();
}

const { registerTemplateScheme, registerTemplateProtocol } = require('./src/main/template-protocol');
const { registerFrameIpc } = require('./src/main/ipc/frames');
const { registerProjectIpc } = require('./src/main/ipc/project');
const { registerAppIpc } = require('./src/main/ipc/app');
const { registerDevIpc } = require('./src/main/ipc/dev');
const { registerRemoteIpc } = require('./src/main/ipc/remote');
const { registerProjectDirtyIpc } = require('./src/main/ipc/project-dirty');
const { installAppMenu } = require('./src/main/app-menu');
const { createStartupWindow, createControlWindow, hasControlWindow } = require('./src/main/app-windows');
const { destroyAllFrameWindows } = require('./src/main/frame-windows');
const { devResume } = require('./src/main/dev-resume');
const { applyRemoteConfig, stopRemoteServer } = require('./src/main/remote-server');
const { getActiveProject } = require('./src/main/project-store');
const { sendControlDebug, notifyDisplaysChanged } = require('./src/main/control-channel');

// Must be called before app.whenReady
registerTemplateScheme();

registerFrameIpc();
registerProjectIpc();
registerAppIpc();
registerDevIpc();
registerRemoteIpc();
registerProjectDirtyIpc();

app.whenReady().then(() => {
    registerTemplateProtocol();

    installAppMenu();
    if (!devResume()) {
        createStartupWindow();
    }
    app.setAboutPanelOptions({ applicationName: 'Ceremonator' });
    // Reflects whatever project devResume() may have already made active (or none) — reapplied
    // on every subsequent project open/create/save, see ipc/project.js.
    applyRemoteConfig(getActiveProject());
    screen.on('display-added', notifyDisplaysChanged);
    screen.on('display-removed', (_event, display) => {
        notifyDisplaysChanged();
        sendControlDebug('streaming-display-unavailable', 'Display “' + (display.label || display.id) + '” was disconnected and is no longer available.');
    });
});

app.on('render-process-gone', (_event, webContents, details) => {
    sendControlDebug('electron-failure', 'The ' + (webContents.__ceremonatorRole || 'unknown') + ' window stopped unexpectedly: ' + details.reason + '.');
});

app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    sendControlDebug('electron-failure', 'Electron’s ' + details.type + ' process stopped unexpectedly: ' + details.reason + '.');
});

app.on('web-contents-created', (_event, contents) => {
    contents.on('did-fail-load', (_loadEvent, code, description, url, isMainFrame) => {
        if (isMainFrame === false || code === -3) return;
        sendControlDebug('load-failure', 'The ' + (contents.__ceremonatorRole || 'application') + ' window could not load “' + url + '”: ' + description + ' (' + code + ').');
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (!hasControlWindow()) createControlWindow();
});

app.on('before-quit', () => {
    destroyAllFrameWindows();
    stopRemoteServer();
});

try {
    require('electron-reloader')(module);
} catch {}
