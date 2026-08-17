// Main-process mirror of the renderer's FEED/FRAMES_WINDOW_STATUS Angular constants (app.js) —
// plain Node exports since main-process code has no Angular DI to inject into.

const FEED = {
    LIVE: 'live',
    PREVIEW: 'preview'
};

const FRAME_STATUS = {
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    READY: 'ready',
    CRASHED: 'crashed'
};

module.exports = { FEED, FRAME_STATUS };
