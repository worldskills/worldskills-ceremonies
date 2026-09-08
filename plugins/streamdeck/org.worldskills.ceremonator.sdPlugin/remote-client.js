'use strict';
const WebSocket = require('ws');
const { randomUUID } = require('crypto');

// Close codes Ceremonator uses to explain a rejected connection.
const CLOSE_REASONS = {
    4001: 'Incorrect PIN. Update settings and Apply.',
    4003: 'Connection origin rejected. Check the instance URL / proxy.',
    4008: 'Too many PIN attempts. Retrying in 60 seconds…',
};

class RemoteClient {
    constructor(config, changed) {
        this.config = config;
        this.changed = changed;
        this.pending = new Map();
        this.status = 'Connecting…';
        this.frames = [];
        this.feedTypes = [];
        this.connect();
    }

    connect() {
        this.ready = false;
        this.status = 'Connecting…';
        this.changed();

        const ws = (this.ws = new WebSocket(this.config.url, {
            origin: this.config.origin,
            handshakeTimeout: 7000,
        }));
        const deadline = setTimeout(() => ws.terminate(), 10000);

        let alive = true;
        const heartbeat = setInterval(() => {
            if (!alive) {
                ws.terminate();
                return;
            }
            alive = false;
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, 10000);

        ws.on('pong', () => {
            alive = true;
        });

        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'auth', pin: this.config.pin }));
        });

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (_) {
                return;
            }
            if (!msg || typeof msg !== 'object') {
                return;
            }

            if (msg.type === 'auth-ok') {
                clearTimeout(deadline);
                this.ready = Array.isArray(msg.capabilities) && msg.capabilities.includes('stream-deck-v1');
                this.status = this.ready ? 'Connected' : 'Update Ceremonator to a version with Stream Deck support.';
                this.changed();
            } else if (msg.type === 'state') {
                const snapshot = msg.frames;
                this.frames = Array.isArray(snapshot) ? snapshot : (snapshot && snapshot.frames) || [];
                this.feedTypes = Array.isArray(snapshot) ? [{ id: 'main' }] : (snapshot && snapshot.feedTypes) || [];
                this.changed();
            } else if (msg.type === 'command-result') {
                const pending = this.pending.get(msg.id);
                if (!pending) {
                    return;
                }
                clearTimeout(pending.timer);
                this.pending.delete(msg.id);
                if (msg.ok) {
                    pending.resolve();
                } else {
                    pending.reject(new Error(msg.error || 'Command failed.'));
                }
            }
        });

        ws.on('error', () => {
            /* close handles errors without logging URLs or credentials */
        });

        ws.on('close', (code) => {
            clearTimeout(deadline);
            clearInterval(heartbeat);
            this.ready = false;
            this.frames = [];
            this.feedTypes = [];

            this.pending.forEach((pending) => {
                clearTimeout(pending.timer);
                pending.reject(
                    new Error('Connection lost; command outcome unknown. Check the output before retrying.')
                );
            });
            this.pending.clear();

            this.status = CLOSE_REASONS[code] || 'Disconnected. Reconnecting…';
            if (this.stopped) {
                return;
            }
            this.changed();
            if (code !== 4001 && code !== 4003) {
                this.retry = setTimeout(() => this.connect(), code === 4008 ? 60000 : 3000);
            }
        });
    }

    command(command) {
        if (!this.ready || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error(this.status));
        }
        if (this.pending.size >= 32) {
            return Promise.reject(new Error('Too many pending commands.'));
        }
        return new Promise((resolve, reject) => {
            const id = randomUUID();
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('No acknowledgement; outcome unknown. Check the output before retrying.'));
            }, 10000);
            this.pending.set(id, { resolve, reject, timer });
            // Commands are never queued or replayed on reconnect.
            this.ws.send(JSON.stringify({ type: 'command', id, command }));
        });
    }

    close() {
        this.stopped = true;
        clearTimeout(this.retry);
        this.ws.terminate();
    }
}

module.exports = { RemoteClient };
