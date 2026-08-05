const fs = require('fs');
const path = require('path');
const { protocol } = require('electron');
const { appRoot, bundledTemplateDir } = require('./paths');
const { getActiveTemplateDir, getActiveProjectDir } = require('./project-store');

// Must be called before app.whenReady
function registerTemplateScheme() {
    protocol.registerSchemesAsPrivileged([{
        scheme: 'wstemplate',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }]);
}

// Null when rel escapes base (path traversal guard), shared by both hosts below.
function resolveUnder(base, rel) {
    if (!base) return null;
    const p = path.normalize(path.join(base, rel));
    const b = path.normalize(base);
    return (p === b || p.startsWith(b + path.sep)) ? p : null;
}

function registerTemplateProtocol() {
    protocol.registerFileProtocol('wstemplate', (request, cb) => {
        const url = new URL(request.url);
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');

        // Host 'project' resolves under the active project dir (its own data/ folder);
        // any other host resolves under the template dir, falling back to the bundled default
        // when no project template exists.
        const primary = url.host === 'project'
            ? getActiveProjectDir()
            : (getActiveTemplateDir() || bundledTemplateDir);

        const hit = resolveUnder(primary, rel);
        if (hit && fs.existsSync(hit)) {
            return cb({ path: hit });
        }

        // Fall back to app root for shared assets (images/, data/, fonts/).
        const fallback = resolveUnder(appRoot, rel);
        return fallback ? cb({ path: fallback }) : cb({ error: -6 });
    });
}

module.exports = { registerTemplateScheme, registerTemplateProtocol };
