const fs = require('fs');
const path = require('path');
const { bundledTemplateDir, bundledImagesDir } = require('./paths');

let activeProjectDir = null;
let activeTemplateDir = null;
let activeProject = null;

function resolveTemplateDir(dir) {
    const templateDir = path.join(dir, 'template');
    if (fs.existsSync(templateDir)) return templateDir;
    const legacyDir = path.join(dir, 'screens');
    if (fs.existsSync(legacyDir)) return legacyDir;
    return null;
}

function loadProjectFolder(dir) {
    const projectFile = path.join(dir, 'project.json');
    if (!fs.existsSync(projectFile)) {
        return { ok: false, code: 'noprojectjson', error: 'No project.json found in folder.' };
    }
    try {
        const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));

        const orderingFile = path.join(dir, 'ordering.json');
        if (fs.existsSync(orderingFile)) {
            try {
                const ordering = JSON.parse(fs.readFileSync(orderingFile, 'utf8'));
                if (ordering && ordering.frames && project.frames) {
                    project.frames = project.frames.map(function (f) {
                        return Object.assign({}, f, { ordering: ordering.frames[f.id] || f.ordering });
                    });
                }
            } catch (e) {}
        }

        const templateDir = resolveTemplateDir(dir);
        return { ok: true, dir, project, templateDir };
    } catch (e) {
        return { ok: false, code: 'invalidjson', error: 'Invalid project.json: ' + e.message };
    }
}

function extractOrdering(project) {
    const frames = {};
    if (project.frames) {
        project.frames.forEach(function (f) {
            frames[f.id] = f.ordering || { mode: 'skills', skillNumbers: [], includeAlbertVidal: true };
        });
    }
    return { version: 1, frames: frames };
}

function stripOrdering(project) {
    if (!project || !project.frames) return project;
    const stripped = Object.assign({}, project);
    stripped.frames = project.frames.map(function (f) {
        const copy = Object.assign({}, f);
        delete copy.ordering;
        return copy;
    });
    return stripped;
}

function copyDefaultTemplate(dest) {
    if (!fs.existsSync(bundledTemplateDir)) throw new Error('Default screens/ folder not found in app directory.');
    fs.cpSync(bundledTemplateDir, dest, { recursive: true });

    if (fs.existsSync(bundledImagesDir)) {
        fs.cpSync(bundledImagesDir, path.join(dest, 'images'), { recursive: true });
    }
}

function setActive(dir, project, templateDir) {
    activeProjectDir = dir;
    activeProject = project;
    activeTemplateDir = templateDir;
}

// Update just the active project object (e.g. after project:saveCurrent),
// without touching activeProjectDir/activeTemplateDir.
function setActiveProject(project) {
    activeProject = project;
}

function getActiveProjectDir() { return activeProjectDir; }
function getActiveProject() { return activeProject; }
function getActiveTemplateDir() { return activeTemplateDir; }

module.exports = {
    loadProjectFolder,
    resolveTemplateDir,
    extractOrdering,
    stripOrdering,
    copyDefaultTemplate,
    setActive,
    setActiveProject,
    getActiveProjectDir,
    getActiveProject,
    getActiveTemplateDir,
};
