const { dialog } = require('electron');

function attachCloseShortcuts(win, opts) {
    const escapeLeavesFullscreen = !!(opts && opts.escapeLeavesFullscreen);
    win.webContents.on('before-input-event', (_event, input) => {
        if (input.type !== 'keyDown') return;
        if (escapeLeavesFullscreen && input.key === 'Escape' && win.isFullScreen()) {
            win.setFullScreen(false);
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'w') {
            win.close();
        }
    });
}

// Returns false to mean the caller should preventDefault(); win.__forceClose (set by the caller) skips the dialog for already-confirmed closes.
function confirmClose(win, opts) {
    if (win.__forceClose) return true;
    const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Close', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: opts.title,
        message: opts.message
    });
    return choice === 0;
}

module.exports = { attachCloseShortcuts, confirmClose };
