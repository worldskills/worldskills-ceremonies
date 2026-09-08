// Stream Deck commands have a separate, strictly bounded contract from the tablet actions.
const FRAME_ID = /^[a-z][a-z0-9_-]*$/i;

// feedIds are the output feeds the open project configures — there are no fixed feed names.
function validCommand(command, feedIds) {
    if (!command || typeof command !== 'object') return false;
    const frame = (id) => typeof id === 'string' && id.length <= 100 && FRAME_ID.test(id);
    const frames = (ids) => Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(frame);
    const feed = Array.isArray(feedIds) && feedIds.indexOf(command.feedType) >= 0;
    const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
    switch (command.name) {
        case 'operator':
            return (
                command.frameIds === undefined &&
                frame(command.frameId) &&
                ['previous', 'next', 'blank', 'live', 'show', 'preview', 'state', 'resetStates', 'context'].includes(
                    command.action
                ) &&
                (feed || command.feedType === 'all') &&
                (!['show', 'preview', 'state', 'resetStates', 'context'].includes(command.action) ||
                    (integer(command.slideIndex, 0, 10000) &&
                        typeof command.slideId === 'string' &&
                        command.slideId.length <= 500)) &&
                (command.action !== 'state' || (typeof command.state === 'string' && command.state.length <= 200)) &&
                (command.action !== 'context' || command.context !== undefined)
            );
        case 'continueLive':
            return frame(command.frameId);
        case 'navigateFrame':
            return frame(command.frameId) && ['previous', 'next'].includes(command.direction);
        case 'openLive':
            return frame(command.frameId) && feed;
        case 'blankFrames':
            return frames(command.frameIds) && (feed || command.feedType === 'all');
        case 'openGrid':
            return (
                (command.frameIds === undefined || frames(command.frameIds)) &&
                feed &&
                ['live', 'preview'].includes(command.channel) &&
                typeof command.fullscreen === 'boolean' &&
                integer(command.columns, 1, 100) &&
                integer(command.width, 320, 7680) &&
                integer(command.height, 240, 4320)
            );
        default:
            return false;
    }
}
module.exports = { validCommand };
