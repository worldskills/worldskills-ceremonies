const PROJECT_SCHEMA_VERSION = 2;
const DEFAULT_REMOTE_PORT = 17321;
const DEFAULT_REMOTE_PIN = '173210';

const FEED_ID = /^[a-z][a-z0-9_-]*$/i;
const TEMPLATE_NAME = /^[a-z0-9_-]+\.html$/i;
const DEFAULT_FEED_ID = 'main';
const MAX_FEEDS = 6;

const ROUTING_KINDS = ['callup', 'medals', 'mfe', 'bestOfNation', 'albertVidal'];
const FEED_VIDEO_KINDS = new Set(['default', 'free'].concat(ROUTING_KINDS));

function validVideoFilename(value) {
    return typeof value === 'string' && value.length <= 200 && !/[\\/]/.test(value);
}

function defaultRouting(feedTypes) {
    const audience = feedTypes[0].id;
    const sponsor = feedTypes.length > 1 ? feedTypes[1].id : null;
    const sponsorContent = sponsor ? { [sponsor]: 'partners.html' } : {};
    const both = sponsor ? [audience, sponsor] : [audience];

    return {
        callup: {
            base: [audience],
            stateFeed: audience,
            states: sponsor ? { Sponsors: sponsor } : {},
            content: sponsorContent,
        },
        medals: { base: both, stateFeed: audience, states: {}, content: sponsorContent },
        mfe: { base: both, stateFeed: audience, states: {}, content: sponsorContent },
        bestOfNation: {
            base: [sponsor || audience],
            stateFeed: sponsor || audience,
            states: {},
            content: {},
        },
        albertVidal: { base: [audience], stateFeed: audience, states: {}, content: {} },
    };
}

function normalizeRouting(routing, feedTypes) {
    const defaults = defaultRouting(feedTypes);
    if (routing == null) {
        return { ok: true, routing: defaults };
    }
    if (typeof routing !== 'object' || Array.isArray(routing)) {
        return { ok: false, error: 'Project routing must be an object keyed by slide kind.' };
    }

    const known = new Set(feedTypes.map((feed) => feed.id));
    const unknownKind = Object.keys(routing).find((kind) => ROUTING_KINDS.indexOf(kind) < 0);
    if (unknownKind) {
        return {
            ok: false,
            error: 'Unknown routing entry "' + unknownKind + '". Expected one of: ' + ROUTING_KINDS.join(', ') + '.',
        };
    }

    const normalized = {};
    for (const kind of ROUTING_KINDS) {
        const entry = routing[kind];
        if (entry == null) {
            normalized[kind] = defaults[kind];
            continue;
        }
        if (typeof entry !== 'object' || Array.isArray(entry)) {
            return { ok: false, error: 'Routing for "' + kind + '" must be an object.' };
        }

        const base = entry.base == null ? defaults[kind].base : entry.base;
        if (!Array.isArray(base) || base.some((id) => !known.has(id))) {
            return {
                ok: false,
                error: 'Routing for "' + kind + '" names an output feed the project does not configure.',
            };
        }

        const stateFeed = entry.stateFeed == null ? base[0] || feedTypes[0].id : entry.stateFeed;
        if (!known.has(stateFeed)) {
            return {
                ok: false,
                error: 'Routing for "' + kind + '" reveals name an output feed the project does not configure.',
            };
        }

        const states = entry.states == null ? {} : entry.states;
        if (typeof states !== 'object' || Array.isArray(states)) {
            return { ok: false, error: 'Routing states for "' + kind + '" must be an object of reveal name to feed.' };
        }
        for (const name of Object.keys(states)) {
            if (!known.has(states[name])) {
                return {
                    ok: false,
                    error:
                        'Routing for "' +
                        kind +
                        '" reveal "' +
                        name +
                        '" names an output feed the project does not configure.',
                };
            }
        }

        const content = entry.content == null ? {} : entry.content;
        if (typeof content !== 'object' || Array.isArray(content)) {
            return { ok: false, error: 'Routing content for "' + kind + '" must be an object of feed to template.' };
        }
        for (const feedId of Object.keys(content)) {
            if (!known.has(feedId)) {
                return {
                    ok: false,
                    error: 'Routing content for "' + kind + '" names an output feed the project does not configure.',
                };
            }
            if (typeof content[feedId] !== 'string' || !TEMPLATE_NAME.test(content[feedId])) {
                return {
                    ok: false,
                    error: 'Routing content for "' + kind + '" must name a template file, e.g. "partners.html".',
                };
            }
        }

        normalized[kind] = {
            base: base.slice(),
            stateFeed: stateFeed,
            states: Object.assign({}, states),
            content: Object.assign({}, content),
        };
    }

    return { ok: true, routing: normalized };
}

function normalizeRemoteConfig(remote) {
    const config = remote || {};
    const port =
        Number.isInteger(config.port) && config.port > 0 && config.port < 65536 ? config.port : DEFAULT_REMOTE_PORT;
    const candidatePin = String(config.pin == null ? '' : config.pin).trim();
    const pin = /^\d{6}$/.test(candidatePin) ? candidatePin : DEFAULT_REMOTE_PIN;
    return { enabled: config.enabled !== false, port: port, pin: pin };
}

function validateAwardingSequence(sequence, functionalities, frameIds) {
    if (sequence == null) return { ok: true };
    if (
        typeof sequence !== 'object' ||
        Array.isArray(sequence) ||
        typeof sequence.highlightGroup !== 'string' ||
        !functionalities.some(
            (item) => item.group === sequence.highlightGroup && item.scope === 'global' && item.frameId
        ) ||
        typeof sequence.autoHighlightPodium !== 'boolean' ||
        !['blank', 'hold'].includes(sequence.end) ||
        !Array.isArray(sequence.slides) ||
        !sequence.slides.length ||
        sequence.slides.length > ROUTING_KINDS.length
    ) {
        return {
            ok: false,
            error: 'Awarding sequence needs a configured global highlightGroup, autoHighlightPodium boolean, end (blank/hold), and slides.',
        };
    }
    const kinds = new Set();
    for (const step of sequence.slides) {
        if (
            !step ||
            ROUTING_KINDS.indexOf(step.kind) < 0 ||
            kinds.has(step.kind) ||
            (typeof step.highlight !== 'boolean' &&
                (typeof step.highlight !== 'string' || !step.highlight.trim() || step.highlight.length > 200)) ||
            (step.reveals != null &&
                (!Array.isArray(step.reveals) ||
                    step.reveals.length > 200 ||
                    step.reveals.some((name) => typeof name !== 'string' || !name.trim() || name.length > 200) ||
                    new Set(step.reveals).size !== step.reveals.length)) ||
            (step.frameId != null &&
                (step.kind !== 'bestOfNation' || typeof step.frameId !== 'string' || !frameIds.has(step.frameId))) ||
            (typeof step.highlight === 'string' && step.reveals && !step.reveals.includes(step.highlight))
        ) {
            return {
                ok: false,
                error: 'Awarding slides need unique supported kinds, highlight (boolean or reveal name), optional unique reveal names, and an existing Best of Nation frameId when set.',
            };
        }
        kinds.add(step.kind);
    }
    const highlightedFrames = functionalities
        .filter((item) => item.scope === 'global' && item.group === sequence.highlightGroup && item.frameId)
        .map((item) => item.frameId);
    if (new Set(highlightedFrames).size !== highlightedFrames.length) {
        return { ok: false, error: 'Awarding highlightGroup must have at most one highlight per frame.' };
    }
    return { ok: true };
}

function validateProject(project) {
    if (
        !project ||
        project.version !== PROJECT_SCHEMA_VERSION ||
        !Array.isArray(project.frames) ||
        !project.frames.length
    ) {
        return {
            ok: false,
            error: 'Project must use schema version ' + PROJECT_SCHEMA_VERSION + ' and contain at least one frame.',
        };
    }
    const ids = new Set();
    for (const frame of project.frames) {
        if (!frame || typeof frame.id !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(frame.id) || ids.has(frame.id)) {
            return { ok: false, error: 'Frame IDs must be unique, non-empty identifiers.' };
        }
        ids.add(frame.id);
        const size = frame.size || {};
        if (
            !Number.isFinite(size.width) ||
            !Number.isFinite(size.height) ||
            size.width < 320 ||
            size.height < 240 ||
            size.width > 7680 ||
            size.height > 4320
        ) {
            return { ok: false, error: 'Frame "' + frame.id + '" has unusable dimensions.' };
        }
        const ordering = frame.ordering || {};
        if (ordering.mode !== 'skills' || !Array.isArray(ordering.skillNumbers)) {
            return { ok: false, error: 'Frame "' + frame.id + '" has malformed ordering.' };
        }
        frame.position = Object.assign({ monitor: 0, x: null, y: null, fullscreen: false }, frame.position || {});
        frame.ordering = Object.assign({ includeAlbertVidal: false }, ordering);
    }
    if (!Array.isArray(project.languages)) {
        project.languages = [{ lang_code: 'en' }];
    }
    project.skillOrder = Array.isArray(project.skillOrder) ? project.skillOrder.map(String) : [];

    const functionalities = project.dynamicFunctionalities == null ? [] : project.dynamicFunctionalities;
    const functionalityIds = new Set();
    if (!Array.isArray(functionalities)) {
        return { ok: false, error: 'Project dynamicFunctionalities must be an array.' };
    }
    for (const item of functionalities) {
        if (
            !item ||
            typeof item.id !== 'string' ||
            item.id.length > 100 ||
            !FEED_ID.test(item.id) ||
            functionalityIds.has(item.id) ||
            typeof item.label !== 'string' ||
            !item.label.trim() ||
            item.label.length > 200 ||
            (item.scope != null && !['global', 'grid'].includes(item.scope)) ||
            (item.frameId != null && !ids.has(item.frameId)) ||
            (item.group != null &&
                (typeof item.group !== 'string' || item.group.length > 100 || !FEED_ID.test(item.group)))
        ) {
            return {
                ok: false,
                error: 'Dynamic functionalities need unique IDs, labels, valid groups/scopes, and existing frame IDs when specified.',
            };
        }
        functionalityIds.add(item.id);
    }
    project.dynamicFunctionalities = functionalities.map((item) => ({
        id: item.id,
        label: item.label,
        group: item.group || null,
        scope: item.scope || 'global',
        frameId: item.frameId || null,
    }));
    const groups = project.dynamicFunctionalityGroups == null ? {} : project.dynamicFunctionalityGroups;
    if (typeof groups !== 'object' || Array.isArray(groups)) {
        return { ok: false, error: 'Dynamic functionality groups must be an object keyed by group ID.' };
    }
    for (const [id, group] of Object.entries(groups)) {
        if (
            !FEED_ID.test(id) ||
            id.length > 100 ||
            !group ||
            typeof group !== 'object' ||
            Array.isArray(group) ||
            ['label', 'description', 'clearLabel'].some(
                (key) =>
                    group[key] != null &&
                    (typeof group[key] !== 'string' || !group[key].trim() || group[key].length > 200)
            )
        ) {
            return {
                ok: false,
                error: 'Dynamic functionality groups need valid IDs and nonempty display text up to 200 characters.',
            };
        }
    }
    project.dynamicFunctionalityGroups = Object.fromEntries(
        Object.entries(groups).map(([id, group]) => [
            id,
            Object.fromEntries(
                ['label', 'description', 'clearLabel']
                    .filter((key) => group[key] != null)
                    .map((key) => [key, group[key]])
            ),
        ])
    );
    const sequence = validateAwardingSequence(project.awardingSequence, project.dynamicFunctionalities, ids);
    if (!sequence.ok) return sequence;
    const gridState = project.gridConfig && project.gridConfig.dynamicState;
    if (
        gridState != null &&
        (!Array.isArray(gridState) ||
            gridState.some(
                (id) => !project.dynamicFunctionalities.some((item) => item.scope === 'grid' && item.id === id)
            ))
    ) {
        return { ok: false, error: 'Grid dynamicState must contain configured Grid functionality IDs.' };
    }

    // Pre-feed version-2 projects have no feedTypes: one audience feed, old Grid size kept.
    const legacyGrid = project.gridConfig || {};
    const configuredFeeds =
        project.feedTypes == null
            ? [
                  {
                      id: DEFAULT_FEED_ID,
                      gridSize: {
                          width: legacyGrid.frameWidth || 1280,
                          height: legacyGrid.frameHeight || 720,
                      },
                  },
              ]
            : project.feedTypes;
    if (!Array.isArray(configuredFeeds) || !configuredFeeds.length) {
        return { ok: false, error: 'Project must configure at least one output feed.' };
    }
    if (configuredFeeds.length > MAX_FEEDS) {
        return { ok: false, error: 'A project can configure at most ' + MAX_FEEDS + ' output feeds.' };
    }

    const feedIds = new Set();
    for (const feed of configuredFeeds) {
        const size = feed && feed.gridSize;
        if (!feed || typeof feed.id !== 'string' || !FEED_ID.test(feed.id) || feedIds.has(feed.id)) {
            return { ok: false, error: 'Output feed IDs must be unique, non-empty identifiers.' };
        }
        if (feed.label != null && (typeof feed.label !== 'string' || feed.label.length > 40)) {
            return { ok: false, error: 'Output feed "' + feed.id + '" has an unusable label.' };
        }
        if (feed.video != null) {
            const videos = feed.video;
            const validMap =
                videos &&
                typeof videos === 'object' &&
                !Array.isArray(videos) &&
                Object.keys(videos).every((kind) => FEED_VIDEO_KINDS.has(kind) && validVideoFilename(videos[kind]));
            if (!validVideoFilename(videos) && !validMap) {
                return {
                    ok: false,
                    error: 'Output feed "' + feed.id + '" has an unusable video filename or slide-kind map.',
                };
            }
        }
        if (
            !size ||
            !Number.isFinite(size.width) ||
            !Number.isFinite(size.height) ||
            size.width < 320 ||
            size.height < 240 ||
            size.width > 7680 ||
            size.height > 4320
        ) {
            return { ok: false, error: 'Output feed "' + feed.id + '" has unusable grid dimensions.' };
        }
        feedIds.add(feed.id);
    }

    project.feedTypes = configuredFeeds.map((feed) => {
        const normalized = {
            id: feed.id,
            label: feed.label || feed.id,
            gridSize: { width: feed.gridSize.width, height: feed.gridSize.height },
        };
        if (feed.video != null) {
            normalized.video = typeof feed.video === 'string' ? feed.video : Object.assign({}, feed.video);
        }
        return normalized;
    });

    const routing = normalizeRouting(project.routing, project.feedTypes);
    if (!routing.ok) {
        return routing;
    }
    project.routing = routing.routing;

    project.remote = normalizeRemoteConfig(project.remote);

    return { ok: true, project };
}

module.exports = {
    validateProject,
    normalizeRemoteConfig,
    DEFAULT_REMOTE_PORT,
    DEFAULT_REMOTE_PIN,
    PROJECT_SCHEMA_VERSION,
};
