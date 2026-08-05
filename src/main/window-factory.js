const { preloadPath } = require('./paths');
const { devArguments } = require('./dev-flags');

function baseWebPreferences(extra) {
    return Object.assign({
        preload: preloadPath,
        contextIsolation: true,
        devTools: true,
        additionalArguments: devArguments(),
    }, extra);
}

module.exports = { baseWebPreferences };
