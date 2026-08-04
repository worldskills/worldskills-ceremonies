const fs = require('fs');
const path = require('path');
const { protocol } = require('electron');
const { appRoot, bundledTemplateDir } = require('./paths');
const { forceDefaultTemplate } = require('./dev-flags');
const { getActiveTemplateDir } = require('./project-store');

// Must be called before app.whenReady
function registerTemplateScheme() {
    protocol.registerSchemesAsPrivileged([{
        scheme: 'wstemplate',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }]);
}

function registerTemplateProtocol() {
    protocol.registerFileProtocol('wstemplate', (request, cb) => {
        const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');

        // Use the project template dir, falling back to bundled screens/ when no
        // project template was copied (e.g. operator clicked "Skip" on a template-less project).
        // CEREMONATOR_DEFAULT_TEMPLATE=1 (dev only) forces the bundled folder so
        // template edits in the repo are visible without re-copying them.
        const effectiveTemplateDir = forceDefaultTemplate
            ? bundledTemplateDir
            : (getActiveTemplateDir() || bundledTemplateDir);
        const templatePath = path.normalize(path.join(effectiveTemplateDir, rel));
        const templateBase = path.normalize(effectiveTemplateDir);
        const safe = templatePath === templateBase || templatePath.startsWith(templateBase + path.sep);
        if (safe && fs.existsSync(templatePath)) {
            return cb({ path: templatePath });
        }

        // Fall back to app root for shared assets (images/, data/flags/, fonts/, etc.)
        const appPath = path.normalize(path.join(appRoot, rel));
        const appBase = path.normalize(appRoot);
        if (appPath !== appBase && !appPath.startsWith(appBase + path.sep)) {
            return cb({ error: -6 });
        }
        cb({ path: appPath });
    });
}

module.exports = { registerTemplateScheme, registerTemplateProtocol };
