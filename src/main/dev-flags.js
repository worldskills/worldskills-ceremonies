const { app } = require('electron');

// Everything gated on isDev is a dev-only affordance; a packaged show-day build takes none of these paths.
const isDev = !app.isPackaged;

// Passed to every renderer so preload.js can expose dev flags synchronously — control.js
// needs them before its first digest, too early for an async IPC round trip.
function devArguments() {
    const args = [];
    if (isDev) args.push('--ceremonator-dev');
    return args;
}

module.exports = { isDev, devArguments };
