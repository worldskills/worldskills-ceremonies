function markWindow(win, role) {
    if (win && win.webContents) win.webContents.__ceremonatorRole = role;
    return win;
}

function hasRole(event, allowed) {
    const role = event && event.sender && event.sender.__ceremonatorRole;
    return allowed.indexOf(role) >= 0;
}

module.exports = { markWindow, hasRole };
