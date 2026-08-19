const { app } = require('electron');

const isDev = !app.isPackaged;

function devArguments() {
    const args = [];
    if (isDev) {
        args.push('--ceremonator-dev');
    }
    return args;
}

module.exports = { isDev, devArguments };
