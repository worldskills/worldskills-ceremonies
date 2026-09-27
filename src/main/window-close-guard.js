const { dialog } = require('electron');

// opts.confirm ({title, message}) makes Ctrl/Cmd+W confirm here and then force-close, instead of
// going through win.close(): macOS defers close() on a window whose fullscreen transition never
// settled, so a fullscreen Grid could ignore both Ctrl+W and the Windows manager entirely.
function attachCloseShortcuts(win, opts) {
    const escapeLeavesFullscreen = !!(opts && opts.escapeLeavesFullscreen);
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') {
            return;
        }
        if (escapeLeavesFullscreen && input.key === 'Escape' && win.isFullScreen()) {
            win.setFullScreen(false);
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'w') {
            if (input.shift && opts && opts.forceCloseOnShift) {
                event.preventDefault();
                closeWithoutConfirm(win);
            } else if (opts && opts.confirm) {
                event.preventDefault();
                if (confirmClose(win, opts.confirm)) {
                    closeWithoutConfirm(win);
                }
            } else {
                win.close();
            }
        } else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
            win.webContents.toggleDevTools();
        }
    });
}

// destroy() skips the 'close' event (and its dialog) but still emits 'closed', so registry
// cleanup runs; unlike close() it cannot be deferred or swallowed by the OS.
function closeWithoutConfirm(win) {
    if (!win.isDestroyed()) {
        win.destroy();
    }
}

// Returns false to mean the caller should preventDefault(). Already-confirmed closes use closeWithoutConfirm, which never reaches here.
function confirmClose(win, opts) {
    const options = {
        type: 'warning',
        buttons: ['Close', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: opts.title,
        message: opts.message,
    };
    // A sheet attached to a fullscreen window can fail to appear on macOS; ask app-modally instead.
    const choice = win.isFullScreen() ? dialog.showMessageBoxSync(options) : dialog.showMessageBoxSync(win, options);
    return choice === 0;
}

module.exports = { attachCloseShortcuts, confirmClose, closeWithoutConfirm };
