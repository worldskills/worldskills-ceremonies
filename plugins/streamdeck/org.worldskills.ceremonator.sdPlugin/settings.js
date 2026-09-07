'use strict';

const DEFAULTS = {
    url: 'http://127.0.0.1:17321',
    pin: '',
    keyTitle: '',
    frameId: '',
    frameIds: '',
    feedType: 'main',
    channel: 'live',
    columns: 2,
    width: 1280,
    height: 720,
    fullscreen: false
};

function connectionSettings(settings) {
    const url = new URL(settings.url);
    const unsupported = !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !['/', '/ws', ''].includes(url.pathname);
    if (unsupported) {
        throw new Error('Use an instance URL such as http://192.168.1.20:17321.');
    }

    const secure = ['https:', 'wss:'].includes(url.protocol);
    const origin = 'http://' + url.host; // Ceremonator checks this exact Origin, including behind TLS.
    url.protocol = secure ? 'wss:' : 'ws:';
    url.pathname = '/ws';

    const pin = String(settings.pin).trim();
    if (!/^\d{6}$/.test(pin)) {
        throw new Error('Enter the six-digit PIN from Ceremonator Remote settings.');
    }
    return { url: url.href, pin, origin };
}

function commandFor(action, settings) {
    const kind = action.split('.').pop();
    const frameId = String(settings.frameId || '').trim();
    const frameIds = [...new Set(
        String(settings.frameIds || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
    )];

    if (['previous', 'next', 'live', 'continue'].includes(kind) && !frameId) {
        throw new Error('Select a frame.');
    }
    if (kind === 'continue') {
        return { name: 'continueLive', frameId };
    }
    if (kind === 'previous' || kind === 'next') {
        return { name: 'navigateFrame', frameId, direction: kind };
    }
    if (kind === 'live') {
        return { name: 'openLive', frameId, feedType: settings.feedType };
    }
    if (kind === 'blank') {
        if (!frameIds.length) {
            throw new Error('Enter the frame IDs to blank.');
        }
        return { name: 'blankFrames', frameIds, feedType: settings.feedType };
    }
    if (kind === 'grid') {
        return {
            name: 'openGrid',
            ...(frameIds.length ? { frameIds } : {}),
            feedType: settings.feedType,
            channel: settings.channel,
            columns: Number(settings.columns),
            width: Number(settings.width),
            height: Number(settings.height),
            fullscreen: settings.fullscreen === true
        };
    }
    throw new Error('Unknown action.');
}

module.exports = { DEFAULTS, connectionSettings, commandFor };
