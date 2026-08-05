const { app, Menu, screen: electronScreen } = require('electron');

if (require('electron-squirrel-startup')) {
    app.quit();
}

const { registerTemplateScheme, registerTemplateProtocol } = require('./src/main/template-protocol');
const { registerFrameIpc } = require('./src/main/ipc/frames');
const { registerProjectIpc } = require('./src/main/ipc/project');
const { registerAppIpc } = require('./src/main/ipc/app');
const { registerDevIpc } = require('./src/main/ipc/dev');
const { createStartupWindow } = require('./src/main/app-windows');
const { clampAllFrameWindowsToWorkArea, destroyAllFrameWindows } = require('./src/main/frame-windows');
const { devResume } = require('./src/main/dev-resume');

// Must be called before app.whenReady
registerTemplateScheme();

registerFrameIpc();
registerProjectIpc();
registerAppIpc();
registerDevIpc();

app.whenReady().then(() => {
    registerTemplateProtocol();

    Menu.setApplicationMenu(null);
    if (!devResume()) {
        createStartupWindow();
    }
    app.setAboutPanelOptions({ applicationName: 'Ceremonator' });

    electronScreen.on('display-removed', clampAllFrameWindowsToWorkArea);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', destroyAllFrameWindows);

try {
    require('electron-reloader')(module);
} catch {}
