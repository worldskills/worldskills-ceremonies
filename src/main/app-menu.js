const { app, Menu } = require('electron');

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
