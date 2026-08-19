const { readSession } = require('./session-store');
const { loadProjectFolder, setActive } = require('./project-store');
const { createControlWindow, getControlWindow } = require('./app-windows');
const { reopenFrameWindowFromSnapshot } = require('./frame-windows');
const { openGridWindow } = require('./grid-window');

function devResume() {
    if (process.env.CEREMONATOR_NO_RESUME === '1') return false;

    const snapshot = readSession();
    if (!snapshot || !snapshot.projectDir) return false;

    const loaded = loadProjectFolder(snapshot.projectDir);
    if (!loaded.ok) return false;

    setActive(snapshot.projectDir, loaded.project, loaded.templateDir);
    createControlWindow();

    const windows = snapshot.windows || [];
    if (windows.length || snapshot.grid) {
        getControlWindow().webContents.once('did-finish-load', () => {
            windows.forEach(reopenFrameWindowFromSnapshot);
            if (snapshot.grid) {
                openGridWindow(snapshot.grid);
            }
        });
    }
    return true;
}

module.exports = { devResume };
