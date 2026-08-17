const { app, screen: electronScreen } = require('electron');

if (require('electron-squirrel-startup')) {
    app.quit();
}

const { registerTemplateScheme, registerTemplateProtocol } = require('./src/main/template-protocol');
const { registerFrameIpc } = require('./src/main/ipc/frames');
const { registerProjectIpc } = require('./src/main/ipc/project');
const { registerAppIpc } = require('./src/main/ipc/app');
const { registerDevIpc } = require('./src/main/ipc/dev');
const { registerRemoteIpc } = require('./src/main/ipc/remote');
const { installAppMenu } = require('./src/main/app-menu');
const { createStartupWindow, createControlWindow, hasControlWindow } = require('./src/main/app-windows');
const { clampAllFrameWindowsToWorkArea, destroyAllFrameWindows } = require('./src/main/frame-windows');
const { devResume } = require('./src/main/dev-resume');
const { startRemoteServer } = require('./src/main/remote-server');

// Must be called before app.whenReady
registerTemplateScheme();

registerFrameIpc();
registerProjectIpc();
registerAppIpc();
registerDevIpc();
registerRemoteIpc();

app.whenReady().then(() => {
    registerTemplateProtocol();

    installAppMenu();
    if (!devResume()) {
        createStartupWindow();
    }
    app.setAboutPanelOptions({ applicationName: 'Ceremonator' });
    startRemoteServer();

    electronScreen.on('display-removed', clampAllFrameWindowsToWorkArea);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (!hasControlWindow()) createControlWindow();
});

app.on('before-quit', destroyAllFrameWindows);

try {
    require('electron-reloader')(module);
} catch {}
