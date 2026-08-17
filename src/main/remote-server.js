const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const { appRoot } = require('./paths');
const { resolveUnder } = require('./template-protocol');
const { sendRemoteAction, sendControlNotice } = require('./control-channel');

const DEFAULT_PORT = 17321;

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject', '.svg': 'image/svg+xml', '.png': 'image/png'
};

// Explicit allow-list — this server is reachable from the whole LAN, so only the exact static
// assets the remote page needs are exposed, not the app root (unlike wstemplate://'s fallback).
const STATIC_FILES = {
    '/': path.join(appRoot, 'src', 'views', 'remote.html'),
    '/partials/control-workspace.html': path.join(appRoot, 'src', 'views', 'partials', 'control-workspace.html'),
    '/js/control/control-workspace.js': path.join(appRoot, 'src', 'js', 'control', 'control-workspace.js'),
    '/js/remote.js': path.join(appRoot, 'src', 'js', 'remote.js'),
    '/css/control.css': path.join(appRoot, 'src', 'css', 'control.css'),
    '/css/remote.css': path.join(appRoot, 'src', 'css', 'remote.css'),
    '/node_modules/angular/angular.min.js': path.join(appRoot, 'node_modules', 'angular', 'angular.min.js'),
    '/node_modules/@worldskills/bootstrap/dist/css/bootstrap.min.css': path.join(appRoot, 'node_modules', '@worldskills', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'),
    '/node_modules/font-awesome/css/font-awesome.min.css': path.join(appRoot, 'node_modules', 'font-awesome', 'css', 'font-awesome.min.css')
};
const FONT_AWESOME_FONTS_DIR = path.join(appRoot, 'node_modules', 'font-awesome', 'fonts');

let pin = null;
let wss = null;
let server = null;
let currentPort = null;
let lastSnapshot = null;

function generatePin() {
    return String(crypto.randomInt(100000, 1000000));
}

function serveFile(res, filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}

function handleRequest(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method not allowed');
        return;
    }
    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
    catch (_error) { res.writeHead(400); res.end('Bad request'); return; }

    if (STATIC_FILES[urlPath]) return serveFile(res, STATIC_FILES[urlPath]);

    if (urlPath.indexOf('/node_modules/font-awesome/fonts/') === 0) {
        const rel = urlPath.substring('/node_modules/font-awesome/fonts/'.length);
        const hit = resolveUnder(FONT_AWESOME_FONTS_DIR, rel);
        if (hit && fs.existsSync(hit)) return serveFile(res, hit);
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
    if (!wss) return;
    const payload = JSON.stringify({ type: 'state', frames: snapshot });
    wss.clients.forEach((client) => {
        if (client.authed && client.readyState === WebSocket.OPEN) client.send(payload);
    });
}

function validAction(action) {
    const names = ['showSlide', 'previewSlide', 'toggleState', 'resetStates', 'updateContext', 'resetPreview', 'resetFrame', 'prevSlideForFrame', 'nextSlideForFrame'];
    if (!action || names.indexOf(action.name) < 0 || typeof action.frameId !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(action.frameId)) return false;
    if (action.slideIndex != null && (!Number.isInteger(action.slideIndex) || action.slideIndex < 0 || action.slideIndex > 10000)) return false;
    if (action.slideId != null && (typeof action.slideId !== 'string' || action.slideId.length > 500)) return false;
    if (action.state != null && (typeof action.state !== 'string' || action.state.length > 200)) return false;
    return true;
}

// Closes any running server/socket and forgets the last snapshot — used both when a project
// disables the remote and right before restarting on a different port.
function stopRemoteServer() {
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
}

function startRemoteServer(port) {
    currentPort = Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
    pin = generatePin();

    server = http.createServer(handleRequest);
    wss = new WebSocket.Server({ server: server, path: '/ws', maxPayload: 64 * 1024 });
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
        const authTimer = setTimeout(() => {
            if (!ws.authed) ws.close(4002, 'authentication timeout');
        }, 10000);

        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch (e) { return; }

            if (!ws.authed) {
                if (msg.type === 'auth' && msg.pin === pin) {
                    ws.authed = true;
                    clearTimeout(authTimer);
                    failedByIp.delete(ip);
                    ws.send(JSON.stringify({ type: 'auth-ok' }));
                    if (lastSnapshot) ws.send(JSON.stringify({ type: 'state', frames: lastSnapshot }));
                } else {
                    const failures = ((prior && prior.failures) || 0) + 1;
                    failedByIp.set(ip, { failures, blockedUntil: failures >= 5 ? Date.now() + 60000 : 0 });
                    ws.close(4001, 'bad pin');
                }
                return;
            }

            if (msg.type === 'action' && validAction(msg.action)) sendRemoteAction(msg.action);
        });
        ws.on('close', () => clearTimeout(authTimer));
    });

    server.on('error', (err) => {
        sendControlNotice('error', 'Remote control server failed to start on port ' + currentPort + ': ' + err.message);
    });

    server.listen(currentPort);
}

// Applies a project's `remote: {enabled, port}` (project-contract.js fills in defaults for any
// project missing the field), starting/stopping/restarting the server as needed. Called once at
// app boot with whatever project devResume() may have already made active, and again every time
// the active project changes (see ipc/project.js).
function applyRemoteConfig(project) {
    const remote = (project && project.remote) || {};
    const wantEnabled = remote.enabled !== false;
    const port = Number.isInteger(remote.port) && remote.port > 0 ? remote.port : DEFAULT_PORT;

    if (!wantEnabled) { stopRemoteServer(); return; }
    if (server && currentPort === port) return;

    stopRemoteServer();
    startRemoteServer(port);
}

function getInfo() {
    if (!server) return { pin: null, port: null, urls: [] };
    return { pin: pin, port: currentPort, urls: localLanUrls() };
}

module.exports = { applyRemoteConfig, getInfo, broadcastState, DEFAULT_PORT };
