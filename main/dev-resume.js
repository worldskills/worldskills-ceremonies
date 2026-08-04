const { isDev } = require('./dev-flags');
const { readDevSession } = require('./dev-session-store');
const { loadProjectFolder, setActive } = require('./project-store');
const { createControlWindow, getControlWindow } = require('./app-windows');
const { reopenFrameWindowFromSnapshot } = require('./frame-windows');
const { openGridWindow } = require('./grid-window');

// After electron-reloader restarts the app (a main.js or preload.js edit), go
// straight back to the project, control panel, and windows that were open. The
// control renderer restores its own state from the same snapshot — see
// js/dev-session.service.js.
// Set CEREMONATOR_NO_RESUME=1 to start at the project picker instead.
function devResume() {
    if (!isDev || process.env.CEREMONATOR_NO_RESUME === '1') return false;

    const snapshot = readDevSession();
    if (!snapshot || !snapshot.projectDir) return false;

    const loaded = loadProjectFolder(snapshot.projectDir);
    if (!loaded.ok) return false;

    setActive(snapshot.projectDir, loaded.project, loaded.templateDir);
    createControlWindow();

    const windows = snapshot.windows || [];
    if (windows.length || snapshot.grid) {
        getControlWindow().webContents.once('did-finish-load', () => {
            windows.forEach(reopenFrameWindowFromSnapshot);
            if (snapshot.grid) openGridWindow(snapshot.grid);
        });
    }
    return true;
}

module.exports = { devResume };
