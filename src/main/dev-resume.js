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
    // `grid` keeps sessions written by the former single-grid implementation
    // restorable; new snapshots store every independently open grid in `grids`.
    const grids = Array.isArray(snapshot.grids)
        ? snapshot.grids
        : (snapshot.grid ? [snapshot.grid] : []);
    if (windows.length || grids.length) {
        getControlWindow().webContents.once('did-finish-load', () => {
            windows.forEach(reopenFrameWindowFromSnapshot);
            grids.forEach(openGridWindow);
        });
    }
    return true;
}

module.exports = { devResume };
