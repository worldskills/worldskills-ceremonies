const DEFAULT_REMOTE_PORT = 17321;
const DEFAULT_REMOTE_PIN = '173210';

function normalizeRemoteConfig(remote) {
    const config = remote || {};
    const port = Number.isInteger(config.port) && config.port > 0 && config.port < 65536
        ? config.port
        : DEFAULT_REMOTE_PORT;
    const candidatePin = String(config.pin == null ? '' : config.pin).trim();
    const pin = /^\d{6}$/.test(candidatePin) ? candidatePin : DEFAULT_REMOTE_PIN;
    return { enabled: config.enabled !== false, port: port, pin: pin };
}

function validateProject(project) {
    if (!project || project.version !== 2 || !Array.isArray(project.frames) || !project.frames.length) {
        return { ok: false, error: 'Project must use schema version 2 and contain at least one frame.' };
    }
    const ids = new Set();
    for (const frame of project.frames) {
        if (!frame || typeof frame.id !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(frame.id) || ids.has(frame.id)) {
            return { ok: false, error: 'Frame IDs must be unique, non-empty identifiers.' };
        }
        ids.add(frame.id);
        const size = frame.size || {};
        if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 320 || size.height < 240 || size.width > 7680 || size.height > 4320) {
            return { ok: false, error: 'Frame "' + frame.id + '" has unusable dimensions.' };
        }
        const ordering = frame.ordering || {};
        if (ordering.mode !== 'skills' || !Array.isArray(ordering.skillNumbers)) {
            return { ok: false, error: 'Frame "' + frame.id + '" has malformed ordering.' };
        }
        frame.position = Object.assign({ monitor: 0, x: null, y: null, fullscreen: false }, frame.position || {});
        frame.ordering = Object.assign({ includeAlbertVidal: false }, ordering);
    }
    if (!Array.isArray(project.languages)) project.languages = [{ lang_code: 'en' }];
    project.skillOrder = Array.isArray(project.skillOrder) ? project.skillOrder.map(String) : [];

    // Pre-feed version-2 projects are Main-only and retain their old Grid size.
    const legacyGrid = project.gridConfig || {};
    const configuredFeeds = project.feedTypes == null ? [{ id: 'main', gridSize: {
        width: legacyGrid.frameWidth || 1280, height: legacyGrid.frameHeight || 720
    } }] : project.feedTypes;
    if (!Array.isArray(configuredFeeds) || !configuredFeeds.length) {
        return { ok: false, error: 'Project must configure a Main output feed.' };
    }
    const validFeedIds = new Set(['main', 'secondary']);
    const feedIds = new Set();
    for (const feed of configuredFeeds) {
        const size = feed && feed.gridSize;
        if (!feed || !validFeedIds.has(feed.id) || feedIds.has(feed.id)) {
            return { ok: false, error: 'Output feeds must use unique Main and/or Secondary IDs.' };
        }
        if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 320 || size.height < 240 || size.width > 7680 || size.height > 4320) {
            return { ok: false, error: 'Output feed "' + feed.id + '" has unusable grid dimensions.' };
        }
        feedIds.add(feed.id);
    }
    if (!feedIds.has('main')) return { ok: false, error: 'Project must configure a Main output feed.' };
    project.feedTypes = configuredFeeds.map((feed) => ({ id: feed.id, gridSize: { width: feed.gridSize.width, height: feed.gridSize.height } }));

    project.remote = normalizeRemoteConfig(project.remote);

    return { ok: true, project };
}

module.exports = { validateProject, normalizeRemoteConfig, DEFAULT_REMOTE_PORT, DEFAULT_REMOTE_PIN };
