const { app, Menu, screen: electronScreen } = require('electron');

if (require('electron-squirrel-startup')) {
    app.quit();
}

const { forceDefaultTemplate } = require('./main/dev-flags');
const { registerTemplateScheme, registerTemplateProtocol } = require('./main/template-protocol');
const { registerFrameIpc } = require('./main/ipc/frames');
const { registerProjectIpc } = require('./main/ipc/project');
const { registerAppIpc } = require('./main/ipc/app');
const { registerDevIpc } = require('./main/ipc/dev');
const { createStartupWindow } = require('./main/app-windows');
const { clampAllFrameWindowsToWorkArea, destroyAllFrameWindows } = require('./main/frame-windows');
const { devResume } = require('./main/dev-resume');

// Must be called before app.whenReady
registerTemplateScheme();

registerFrameIpc();
registerProjectIpc();
registerAppIpc();
registerDevIpc();

app.whenReady().then(() => {
    registerTemplateProtocol();

    Menu.setApplicationMenu(null);
    if (forceDefaultTemplate) {
        console.log('[dev] CEREMONATOR_DEFAULT_TEMPLATE=1 — serving templates from the bundled screens/ folder.');
    }
    // In dev, resume the project/windows a hot restart just tore down.
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
