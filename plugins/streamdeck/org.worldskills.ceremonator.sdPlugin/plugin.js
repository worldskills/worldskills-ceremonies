'use strict';
const WebSocket = require('ws');
const { DEFAULTS, connectionSettings, commandFor } = require('./settings');
const { RemoteClient } = require('./remote-client');

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const deck = new WebSocket('ws://127.0.0.1:' + option('-port'));
const keys = new Map();
const connections = new Map();
const inspectors = new Set();

function send(event, context, payload) {
    if (deck.readyState === WebSocket.OPEN) deck.send(JSON.stringify({ event, context, ...(payload ? { payload } : {}) }));
}

function refresh(context) {
    const key = keys.get(context);
    if (!key) return;
    const remote = key.connection && key.connection.client;
    const kind = key.action.split('.').pop();
    const label = { previous: 'Prev', next: 'Next', live: 'Open Live', continue: 'Live', grid: 'Grid', blank: 'Blank' }[kind];
    const target = ['previous', 'next', 'live', 'continue'].includes(kind) ? key.settings.frameId : key.settings.frameIds || 'All';
    const title = key.settings.keyTitle || label + '\n' + (target || 'Set frame');
    send('setTitle', context, { title: title + (remote && remote.ready ? '' : '\nOffline'), target: 0 });
    if (inspectors.has(context)) send('sendToPropertyInspector', context, {
        status: key.error || (remote ? remote.status : 'Configure connection.'),
        ready: !!(remote && remote.ready),
        frames: remote ? remote.frames.map((frame) => ({ id: frame.id, label: frame.label })) : [],
        feedTypes: remote ? remote.feedTypes : []
    });
}

function release(context) {
    const key = keys.get(context);
    if (!key || !key.connection) return;
    const connection = key.connection;
    connection.contexts.delete(context);
    if (!connection.contexts.size) {
        // Folder transitions emit disappear before appear. Keep the connection
        // warm briefly so navigating between controls does not reauthenticate.
        connection.idleTimer = setTimeout(() => {
            connection.client.close();
            connections.delete(connection.id);
        }, 30000);
    }
}

function configure(event) {
    const previous = keys.get(event.context);
    const settings = { ...DEFAULTS, ...(event.payload.settings || {}) };
    let config;
    let id;
    let error;
    try { config = connectionSettings(settings); id = JSON.stringify(config); }
    catch (e) { error = e.message; }
    if (previous && previous.connection && previous.connection.id === id) {
        previous.settings = settings;
        previous.error = '';
        if (event.event === 'didReceiveSettings' && previous.connection.client.ws.readyState === WebSocket.CLOSED) {
            clearTimeout(previous.connection.client.retry);
            previous.connection.client.connect();
        }
        refresh(event.context);
        return;
    }
    release(event.context);
    const key = { action: event.action, settings, error };
    keys.set(event.context, key);
    if (config) {
        let connection = connections.get(id);
        if (!connection) {
            connection = { id, contexts: new Set() };
            connection.client = new RemoteClient(config, () => connection.contexts.forEach(refresh));
            connections.set(id, connection);
        }
        connection.contexts.add(event.context);
        clearTimeout(connection.idleTimer);
        key.connection = connection;
    }
    refresh(event.context);
}

deck.on('open', () => deck.send(JSON.stringify({ event: option('-registerEvent'), uuid: option('-pluginUUID') })));
deck.on('message', async (raw) => {
    let event;
    try { event = JSON.parse(raw); } catch (_) { return; }
    if (event.event === 'willAppear' || event.event === 'didReceiveSettings') configure(event);
    else if (event.event === 'willDisappear') {
        release(event.context);
        keys.delete(event.context);
        inspectors.delete(event.context);
    } else if (event.event === 'propertyInspectorDidAppear' || event.event === 'sendToPlugin') {
        inspectors.add(event.context);
        refresh(event.context);
    } else if (event.event === 'propertyInspectorDidDisappear') inspectors.delete(event.context);
    else if (event.event === 'keyDown') {
        // Multi Actions may invoke a key without willAppear, or with newer settings.
        configure(event);
        const key = keys.get(event.context);
        try {
            if (!key.connection) throw new Error(key.error || 'Configure connection first.');
            await key.connection.client.command(commandFor(key.action, key.settings));
            key.error = '';
            send('showOk', event.context);
        } catch (error) {
            key.error = error.message;
            send('showAlert', event.context);
        }
        refresh(event.context);
    }
});
deck.on('error', () => { /* Stream Deck owns plugin lifecycle */ });
deck.on('close', () => {
    connections.forEach((connection) => connection.client.close());
    process.exit(0);
});
