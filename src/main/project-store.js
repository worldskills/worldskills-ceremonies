const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { bundledTemplateDir, bundledDataDir, projectFilePath, orderingFilePath, templateDirPath, projectDataDir } = require('./paths');
const { readJson, writeJson } = require('./json-store');
const { validateProject } = require('./project-contract');

let activeProjectDir = null;
let activeTemplateDir = null;
let activeProject = null;

function resolveTemplateDir(dir) {
    const templateDir = templateDirPath(dir);
    if (fs.existsSync(templateDir)) return templateDir;
    const legacyDir = path.join(dir, 'screens');
    if (fs.existsSync(legacyDir)) return legacyDir;
    return null;
}

function loadProjectFolder(dir) {
    const projectFile = projectFilePath(dir);
    if (!fs.existsSync(projectFile)) {
        return { ok: false, code: 'noprojectjson', error: 'No project.json found in folder.' };
    }
    try {
        const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        const validated = validateProject(project);
        if (!validated.ok) return { ok: false, code: 'invalidproject', error: validated.error };

        let orderingWarning = null;
        const orderingFile = orderingFilePath(dir);
        if (fs.existsSync(orderingFile)) {
            try {
                const ordering = JSON.parse(fs.readFileSync(orderingFile, 'utf8'));
                if (ordering && ordering.frames && project.frames) {
                    project.frames = project.frames.map(function (f) {
                        return Object.assign({}, f, { ordering: ordering.frames[f.id] || f.ordering });
                    });
                }
                if (ordering && Array.isArray(ordering.skillOrder)) {
                    project.skillOrder = ordering.skillOrder.map(String);
                }
            } catch (e) {
                console.error('Failed to parse ordering.json at ' + orderingFile + ':', e.message);
                orderingWarning = 'Corrupt ordering.json in this project — using the slide ordering saved in project.json instead. (' + e.message + ')';
            }
        }

        const templateDir = resolveTemplateDir(dir);
        return { ok: true, dir, project, templateDir, orderingWarning };
    } catch (e) {
        return { ok: false, code: 'invalidjson', error: 'Invalid project.json: ' + e.message };
    }
}

// Returns { templateDir, copyError }; callers decide whether a copy failure needs its own dialog (project:open shows one, project:openPath doesn't).
function ensureTemplates(dir, fallbackTemplateDir) {
    return dialog.showMessageBox({
        type: 'question',
        buttons: ['Copy default templates', 'Skip'],
        defaultId: 0,
        title: 'Templates missing',
        message: 'This project has no template/ folder. Copy default templates from the app?'
    }).then(function (result) {
        if (result.response !== 0) return { templateDir: null };
        try {
            const templateDest = templateDirPath(dir);
            if (fallbackTemplateDir && fs.existsSync(fallbackTemplateDir)) {
                fs.cpSync(fallbackTemplateDir, templateDest, { recursive: true });
            } else {
                copyDefaultTemplate(templateDest);
            }
            return { templateDir: templateDest };
        } catch (e) {
            return { templateDir: null, copyError: e };
        }
    });
}

function writeProjectFiles(dir, project) {
    const validated = validateProject(project);
    if (!validated.ok) throw new Error(validated.error);
    // project.json deliberately retains ordering as the recovery source if ordering.json is corrupt.
    writeJson(projectFilePath(dir), project);
    writeJson(orderingFilePath(dir), extractOrdering(project));
}

function extractOrdering(project) {
    const frames = {};
    if (project.frames) {
        project.frames.forEach(function (f) {
            frames[f.id] = f.ordering || { mode: 'skills', skillNumbers: [], includeAlbertVidal: true };
        });
    }
    return { version: 1, frames: frames, skillOrder: project.skillOrder || [] };
}

function copyDefaultTemplate(dest) {
    if (!fs.existsSync(bundledTemplateDir)) throw new Error('Default template folder (projects/bare-project/template) not found in app directory.');
    fs.cpSync(bundledTemplateDir, dest, { recursive: true });
}

// Skips anything already present, so re-running on an already-populated project is a no-op.
function copyDefaultData(dir) {
    const dest = projectDataDir(dir);
    if (!fs.existsSync(bundledDataDir)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    ['skills.json', 'members.json'].forEach(function (name) {
        const destFile = path.join(dest, name);
        const srcFile = path.join(bundledDataDir, name);
        if (!fs.existsSync(destFile) && fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, destFile);
        }
    });

    const flagsDest = path.join(dest, 'flags');
    const flagsSrc = path.join(bundledDataDir, 'flags');
    if (!fs.existsSync(flagsDest) && fs.existsSync(flagsSrc)) {
        fs.cpSync(flagsSrc, flagsDest, { recursive: true });
    }
}

function setActive(dir, project, templateDir) {
    activeProjectDir = dir;
    activeProject = project;
    activeTemplateDir = templateDir;
}

function setActiveProject(project) {
    activeProject = project;
}

function getActiveProjectDir() { return activeProjectDir; }
function getActiveProject() { return activeProject; }
function getActiveTemplateDir() { return activeTemplateDir; }

module.exports = {
    loadProjectFolder,
    resolveTemplateDir,
    ensureTemplates,
    writeProjectFiles,
    extractOrdering,
    copyDefaultTemplate,
    copyDefaultData,
    setActive,
    setActiveProject,
    getActiveProjectDir,
    getActiveProject,
    getActiveTemplateDir,
};
