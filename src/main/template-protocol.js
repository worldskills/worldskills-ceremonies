const fs = require('fs');
const path = require('path');
const { protocol } = require('electron');
const { appRoot, bareProjectDir, bundledTemplateDir } = require('./paths');
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
        let url, rel;
        try {
            url = new URL(request.url);
            rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        } catch (_error) {
            return cb({ error: -300 });
        }
        if (url.host !== 'active' && url.host !== 'project') return cb({ error: -6 });

        // Host 'project' resolves under the active project dir (its own data/ folder);
        // any other host resolves under the template dir, falling back to the bundled default
        // when no project template exists.
        const roots = url.host === 'project'
            ? [getActiveProjectDir(), bareProjectDir, appRoot]
            : [getActiveTemplateDir(), bundledTemplateDir, appRoot];
        for (const root of roots) {
            const hit = resolveUnder(root, rel);
            if (hit) {
                try { if (fs.statSync(hit).isFile()) return cb({ path: hit }); } catch (_error) { /* try fallback */ }
            }
        }
        return cb({ error: -6 });
    });
}

module.exports = { registerTemplateScheme, registerTemplateProtocol, resolveUnder };
