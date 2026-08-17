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
        frame.position = Object.assign({ monitor: 0, x: null, y: null, fullscreen: false, kiosk: false }, frame.position || {});
        frame.ordering = Object.assign({ includeAlbertVidal: false }, ordering);
    }
    if (!Array.isArray(project.languages)) project.languages = [{ lang_code: 'en' }];
    return { ok: true, project };
}

module.exports = { validateProject };
