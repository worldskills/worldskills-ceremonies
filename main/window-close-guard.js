const { dialog } = require('electron');

// Escape leaves fullscreen (only when asked to); Cmd/Ctrl+W closes — shared by
// every top-level window so the close behavior is identical everywhere.
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

// True when it's OK to proceed with closing win — false means the caller
// should event.preventDefault(). win.__forceClose (set by the caller before
// calling win.close()) skips the dialog for already-confirmed closes.
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
