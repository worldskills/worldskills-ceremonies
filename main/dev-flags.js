const { app } = require('electron');

// ── Development mode ──────────────────────────────────────────────────
// Everything gated on isDev is a development affordance. A packaged
// show-day build takes none of these paths.
const isDev = !app.isPackaged;

// Serve templates from the app's bundled screens/ folder instead of the open
// project's template/ copy, so edits to screens/*.html are visible without
// re-copying them into the project. Launch with:
//   CEREMONATOR_DEFAULT_TEMPLATE=1 npm start
const forceDefaultTemplate = isDev && process.env.CEREMONATOR_DEFAULT_TEMPLATE === '1';

// Passed into every renderer so preload.js can expose the dev flags
// synchronously — control.js needs them before its first digest, which is too
// early for an async IPC round trip.
function devArguments() {
    const args = [];
    if (isDev) args.push('--ceremonator-dev');
    if (forceDefaultTemplate) args.push('--ceremonator-default-templates');
    return args;
}

module.exports = { isDev, forceDefaultTemplate, devArguments };
