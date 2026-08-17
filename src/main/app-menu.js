const { app, Menu } = require('electron');

// No reload / force-reload / toggle-fullscreen roles: a stray shortcut must never touch a live
// audience window. Frame windows have their own guarded Escape/Cmd+W handling (window-close-guard.js)
// and a Reload button in the control panel — nothing here should shadow those.
function installAppMenu() {
    const template = [];

    if (process.platform === 'darwin') {
        template.push({
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });
    }

    template.push(
        { role: 'editMenu' },
        { label: 'View', submenu: [{ role: 'toggleDevTools' }] },
        { role: 'windowMenu' }
    );

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installAppMenu };
