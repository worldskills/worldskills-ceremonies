const { preloadPath } = require('./paths');
const { devArguments } = require('./dev-flags');

function baseWebPreferences(extra) {
    const overrides = Object.assign({}, extra || {});
    const role = overrides.ceremonatorRole || 'control';
    delete overrides.ceremonatorRole;
    return Object.assign({
        preload: preloadPath,
        contextIsolation: true,
        devTools: true,
        additionalArguments: devArguments().concat(['--ceremonator-role=' + role]),
    }, overrides);
}

module.exports = { baseWebPreferences };
