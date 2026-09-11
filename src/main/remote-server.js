const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const { validCommand } = require('./remote-commands');
const { appRoot, bareProjectDir, bundledTemplateDir } = require('./paths');
const projectStore = require('./project-store');
const { resolveUnder } = require('./template-protocol');
const { sendRemoteAction, sendControlNotice, sendControlDebug } = require('./control-channel');
const { normalizeRemoteConfig } = require('./project-contract');

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
};

const STATIC_FILES = {
    '/operator': path.join(appRoot, 'src/views/operator.html'),
    '/js/operator.js': path.join(appRoot, 'src/js/operator.js'),
    '/js/operator-feed.js': path.join(appRoot, 'src/js/operator-feed.js'),
    '/css/operator.css': path.join(appRoot, 'src/css/operator.css'),
    '/': path.join(appRoot, 'src', 'views', 'remote.html'),
    '/partials/control-workspace.html': path.join(appRoot, 'src', 'views', 'partials', 'control-workspace.html'),
    '/partials/slide-row.html': path.join(appRoot, 'src', 'views', 'partials', 'slide-row.html'),
    '/js/control/control-workspace.js': path.join(appRoot, 'src', 'js', 'control', 'control-workspace.js'),
    '/js/remote.js': path.join(appRoot, 'src', 'js', 'remote.js'),
    '/css/control.css': path.join(appRoot, 'src', 'css', 'control.css'),
    '/css/remote.css': path.join(appRoot, 'src', 'css', 'remote.css'),
    '/node_modules/angular/angular.min.js': path.join(appRoot, 'node_modules', 'angular', 'angular.min.js'),
    '/node_modules/@worldskills/bootstrap/dist/css/bootstrap.min.css': path.join(
        appRoot,
        'node_modules',
        '@worldskills',
        'bootstrap',
        'dist',
        'css',
        'bootstrap.min.css'
    ),
    '/node_modules/font-awesome/css/font-awesome.min.css': path.join(
        appRoot,
        'node_modules',
        'font-awesome',
        'css',
        'font-awesome.min.css'
    ),
};
['angular-translate/dist/angular-translate.min.js', 'ng-file-upload/dist/ng-file-upload.min.js'].forEach((name) => {
    STATIC_FILES['/node_modules/' + name] = path.join(appRoot, 'node_modules', name);
});
[
    'app.js',
    'directives.js',
    'screen.js',
    'services/translations-loader.service.js',
    'services/storage-keys.service.js',
    'services/remote-transport.service.js',
].forEach((name) => {
    STATIC_FILES['/js/' + name] = path.join(appRoot, 'src/js', name);
});
const FONT_AWESOME_FONTS_DIR = path.join(appRoot, 'node_modules', 'font-awesome', 'fonts');

let pin = null;
let wss = null;
let server = null;
let currentPort = null;
let lastSnapshot = null;
let heartbeat = null;
const pendingCommands = new Map();
const assetSessions = new Set();

function completeCommand(requestId, result) {
    const pending = pendingCommands.get(requestId);
    if (!pending) {
        return;
    }

    clearTimeout(pending.timer);
    pendingCommands.delete(requestId);

    if (pending.ws.readyState === WebSocket.OPEN) {
        pending.ws.send(
            JSON.stringify({
                type: 'command-result',
                id: pending.id,
                ok: !!(result && result.ok),
                error: result && result.error,
            })
        );
    }
}

function dispatchCommand(ws, msg) {
    if (typeof msg.id !== 'string' || msg.id.length > 100) {
        return;
    }

    const reject = (error) => ws.send(JSON.stringify({ type: 'command-result', id: msg.id, ok: false, error }));

    if (!validCommand(msg.command, projectStore.feedIds())) {
        return reject('Invalid command parameters.');
    }

    const inFlight = Array.from(pendingCommands.values()).filter((p) => p.ws === ws).length;
    if (inFlight >= 32) {
        return reject('Too many pending commands.');
    }

    const requestId = randomUUID();
    const timer = setTimeout(() => {
        completeCommand(requestId, { ok: false, error: 'Control window did not respond; outcome unknown.' });
    }, 8000);

    pendingCommands.set(requestId, { ws, id: msg.id, timer });

    if (!sendRemoteAction({ name: 'streamDeckCommand', command: msg.command, requestId })) {
        completeCommand(requestId, { ok: false, error: 'Open the Ceremonator control window first.' });
    }
}

// Nothing this server hands out may be cached: the project's own files change between takes.
function noStore(mime, extra) {
    return Object.assign({ 'Content-Type': mime, 'Cache-Control': 'no-store' }, extra || {});
}

function serveFile(res, filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, noStore(MIME[path.extname(filePath)] || 'application/octet-stream'));
        res.end(data);
    });
}

function serveBinaryAsset(req, res, filePath, mime) {
    const size = fs.statSync(filePath).size;
    const headers = noStore(mime, { 'Referrer-Policy': 'no-referrer', 'Accept-Ranges': 'bytes' });

    let start = 0;
    let end = size - 1;
    let status = 200;

    // Safari media requests can probe only the first bytes before loading video.
    if (req.headers.range && req.method !== 'HEAD') {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (match && (match[1] || match[2])) {
            if (!match[1]) {
                // A suffix range ("bytes=-500") asks for the tail of the file.
                start = Math.max(0, size - Number(match[2]));
            } else {
                start = Number(match[1]);
                if (match[2]) {
                    end = Math.min(end, Number(match[2]));
                }
            }

            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
                res.writeHead(
                    416,
                    Object.assign(headers, {
                        'Content-Range': 'bytes */' + size,
                        'Content-Length': 0,
                    })
                );
                res.end();
                return;
            }

            status = 206;
            headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
        }
    }

    headers['Content-Length'] = Math.max(0, end - start + 1);
    res.writeHead(status, headers);

    if (req.method === 'HEAD' || !size) {
        res.end();
        return;
    }

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
}

// Operator runs in a browser, so the active project's template and data files are reachable
// only through this route — scoped to one authenticated socket, re-checked against its root.
function serveOperatorAsset(req, res, asset) {
    const token = asset[1];
    const host = asset[2];
    const rel = path.posix.normalize(asset[3]);

    if (!assetSessions.has(token)) {
        res.writeHead(401);
        res.end('Reconnect Operator');
        return;
    }

    if (host === 'project' && !rel.startsWith('data/') && rel !== 'translations.json') {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const roots =
        host === 'active'
            ? [projectStore.getActiveTemplateDir(), bundledTemplateDir]
            : [projectStore.getActiveProjectDir(), bareProjectDir];

    for (const root of roots) {
        const hit = resolveUnder(root, rel);
        try {
            if (!hit || !fs.statSync(hit).isFile()) {
                continue;
            }

            // Re-check the resolved file against the real root: a symlink inside the
            // project must not become a way out of it.
            const allowedRoot = host === 'project' && rel.startsWith('data/') ? path.join(root, 'data') : root;
            const realRoot = fs.realpathSync(allowedRoot);
            if (!resolveUnder(realRoot, path.relative(realRoot, fs.realpathSync(hit)))) {
                continue;
            }

            const ext = path.extname(hit).toLowerCase();
            const mime = MIME[ext];
            if (!mime) {
                break;
            }

            if (['.html', '.css', '.js', '.json', '.svg'].includes(ext)) {
                const data = fs
                    .readFileSync(hit, 'utf8')
                    .replace(/wstemplate:\/\/(active|project)\//g, '/operator-assets/' + token + '/$1/');
                res.writeHead(
                    200,
                    noStore(mime, {
                        'Referrer-Policy': 'no-referrer',
                        'Content-Length': Buffer.byteLength(data),
                    })
                );
                res.end(req.method === 'HEAD' ? undefined : data);
            } else {
                serveBinaryAsset(req, res, hit, mime);
            }
            return;
        } catch (_error) {
            // Try the bundled fallback.
        }
    }

    res.writeHead(404);
    res.end('Asset not found');
}

// The Operator monitor iframe runs screen.html itself, rewritten for HTTP delivery.
function serveOperatorFeedPage(req, res) {
    fs.readFile(path.join(appRoot, 'src/views/screen.html'), 'utf8', (err, html) => {
        if (err) {
            res.writeHead(500);
            res.end('Feed unavailable');
            return;
        }

        // operator-feed.js re-adds the stylesheet through the asset route, so the
        // wstemplate:// link the desktop window uses comes out here.
        const page = html
            .replace(/<link href="wstemplate:\/\/active\/css\/screen\.css" rel="stylesheet"\s*\/?>/, '')
            .replace(/\.\.\/\.\.\/node_modules\//g, '/node_modules/')
            .replace(/\.\.\/js\//g, '/js/')
            .replace(
                '<script src="/js/screen.js">',
                '<script src="/js/operator-feed.js"></script><script src="/js/screen.js">'
            );

        res.writeHead(200, noStore('text/html'));
        res.end(page);
    });
}

function handleRequest(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method not allowed');
        return;
    }

    let urlPath;
    try {
        urlPath = decodeURIComponent(req.url.split('?')[0]);
    } catch (_error) {
        res.writeHead(400);
        res.end('Bad request');
        return;
    }

    if (STATIC_FILES[urlPath]) {
        serveFile(res, STATIC_FILES[urlPath]);
        return;
    }

    // Asset access lasts only as long as its authenticated WebSocket session.
    const asset = /^\/operator-assets\/([a-f0-9-]+)\/(active|project)\/(.*)$/.exec(urlPath);
    if (asset) {
        serveOperatorAsset(req, res, asset);
        return;
    }

    if (urlPath === '/operator-feed.html') {
        serveOperatorFeedPage(req, res);
        return;
    }

    if (urlPath.indexOf('/node_modules/font-awesome/fonts/') === 0) {
        const rel = urlPath.substring('/node_modules/font-awesome/fonts/'.length);
        const hit = resolveUnder(FONT_AWESOME_FONTS_DIR, rel);
        if (hit && fs.existsSync(hit)) {
            serveFile(res, hit);
            return;
        }
    }

    res.writeHead(404);
    res.end('Not found');
}

function localLanUrls() {
    const urls = [];
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach((name) => {
        (interfaces[name] || []).forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
                urls.push('http://' + iface.address + ':' + currentPort + '/');
            }
        });
    });
    return urls;
}

function broadcastState(snapshot) {
    lastSnapshot = snapshot;
    if (!wss) {
        return;
    }

    const payload = JSON.stringify({ type: 'state', frames: snapshot });
    wss.clients.forEach((client) => {
        if (client.authed && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function validAction(action) {
    const names = [
        'showSlide',
        'previewSlide',
        'toggleState',
        'resetStates',
        'updateContext',
        'resetPreview',
        'resetFrame',
        'prevSlideForFrame',
        'nextSlideForFrame',
    ];

    if (!action || names.indexOf(action.name) < 0) {
        return false;
    }
    if (typeof action.frameId !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(action.frameId)) {
        return false;
    }
    if (
        action.slideIndex != null &&
        (!Number.isInteger(action.slideIndex) || action.slideIndex < 0 || action.slideIndex > 10000)
    ) {
        return false;
    }
    if (action.slideId != null && (typeof action.slideId !== 'string' || action.slideId.length > 500)) {
        return false;
    }
    if (action.state != null && (typeof action.state !== 'string' || action.state.length > 200)) {
        return false;
    }
    if (action.feedType != null && !projectStore.isFeedId(action.feedType)) {
        return false;
    }
    return true;
}

function stopRemoteServer() {
    clearInterval(heartbeat);
    assetSessions.clear();
    pendingCommands.forEach((pending) => clearTimeout(pending.timer));
    pendingCommands.clear();
    if (wss) {
        wss.clients.forEach((client) => client.terminate());
        wss.close();
        wss = null;
    }
    if (server) {
        server.close();
        server = null;
    }
    lastSnapshot = null;
    currentPort = null;
    pin = null;
}

function startRemoteServer(config) {
    currentPort = config.port;
    pin = config.pin;

    server = http.createServer(handleRequest);
    wss = new WebSocket.Server({ server: server, path: '/ws', maxPayload: 64 * 1024 });
    // A socket that missed the previous ping is gone, whatever its readyState claims.
    heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.alive === false) {
                ws.terminate();
                return;
            }
            ws.alive = false;
            ws.ping();
        });
    }, 30000);

    const failedByIp = new Map();

    wss.on('connection', (ws, request) => {
        const expectedOrigin = 'http://' + request.headers.host;
        if (request.headers.origin !== expectedOrigin) {
            ws.close(4003, 'bad origin');
            return;
        }
        const ip = request.socket.remoteAddress || 'unknown';
        const prior = failedByIp.get(ip);
        if (prior && prior.blockedUntil > Date.now()) {
            ws.close(4008, 'too many attempts');
            return;
        }
        ws.authed = false;
        ws.alive = true;
        ws.on('pong', () => {
            ws.alive = true;
        });
        ws.on('error', () => {
            ws.terminate();
        });

        const authTimer = setTimeout(() => {
            if (!ws.authed) {
                ws.close(4002, 'authentication timeout');
            }
        }, 10000);

        const clientLabel = () => (ws.clientType === 'operator' ? 'Operator' : 'Remote control');

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (e) {
                return;
            }
            if (!msg || typeof msg !== 'object') {
                return;
            }

            if (!ws.authed) {
                if (msg.type !== 'auth' || msg.pin !== pin) {
                    const failures = ((prior && prior.failures) || 0) + 1;
                    failedByIp.set(ip, { failures, blockedUntil: failures >= 5 ? Date.now() + 60000 : 0 });
                    ws.close(4001, 'bad pin');
                    return;
                }

                ws.authed = true;
                ws.clientType = msg.client === 'operator' ? 'operator' : 'remote';
                ws.assetToken = randomUUID();
                assetSessions.add(ws.assetToken);
                clearTimeout(authTimer);
                failedByIp.delete(ip);

                ws.send(
                    JSON.stringify({
                        type: 'auth-ok',
                        capabilities: ['stream-deck-v1', 'operator-v1'],
                        assetToken: ws.assetToken,
                        languages: (projectStore.getActiveProject() || {}).languages || [{ lang_code: 'en' }],
                    })
                );
                sendControlDebug('remote-connected', clientLabel() + ' connected from ' + ip + '.');

                if (lastSnapshot) {
                    ws.send(JSON.stringify({ type: 'state', frames: lastSnapshot, cached: true }));
                }
                return;
            }

            if (msg.type === 'action' && validAction(msg.action)) {
                sendRemoteAction(msg.action);
            }
            if (msg.type === 'command') {
                dispatchCommand(ws, msg);
            }
            if (msg.type === 'ping') {
                sendRemoteAction({ name: 'operatorHeartbeat' });
            }
            if (
                msg.type === 'debug' &&
                ws.clientType === 'operator' &&
                ['operator-feed-error', 'streaming-display-unavailable'].includes(msg.debugType)
            ) {
                sendControlDebug(msg.debugType, String(msg.message || '').slice(0, 500));
            }
        });

        ws.on('close', () => {
            if (ws.authed) {
                sendControlDebug('remote-disconnected', clientLabel() + ' disconnected from ' + ip + '.');
            }

            clearTimeout(authTimer);
            assetSessions.delete(ws.assetToken);

            pendingCommands.forEach((pending, id) => {
                if (pending.ws === ws) {
                    clearTimeout(pending.timer);
                    pendingCommands.delete(id);
                }
            });
        });
    });

    server.on('error', (err) => {
        sendControlNotice('error', 'Remote control server failed to start on port ' + currentPort + ': ' + err.message);
    });

    server.listen(currentPort);
}

function applyRemoteConfig(project) {
    const remote = normalizeRemoteConfig(project && project.remote);

    if (!remote.enabled) {
        stopRemoteServer();
        return;
    }

    // Already listening on this exact port and PIN — restarting would drop live clients.
    if (server && currentPort === remote.port && pin === remote.pin) {
        return;
    }

    stopRemoteServer();
    startRemoteServer(remote);
}

function getInfo() {
    if (!server || !server.listening) {
        return { pin: null, port: null, urls: [] };
    }
    return { pin: pin, port: currentPort, urls: localLanUrls() };
}

module.exports = {
    applyRemoteConfig,
    stopRemoteServer,
    getInfo,
    broadcastState,
    completeCommand,
};
