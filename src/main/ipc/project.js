const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { readConfig, writeConfig, addRecent } = require('../config-store');
const projectStore = require('../project-store');
const { readJson, writeJson } = require('../json-store');
const { projectFilePath, templateDirPath, translationsFilePath, projectDataDir, appRoot, projectsRootDir } = require('../paths');

function registerProjectIpc() {
    ipcMain.handle('project:recent', () => {
        const cfg = readConfig();
        return cfg.recentProjects || [];
    });

    // Projects that ship inside projects/ (source-controlled, shared with every organiser),
    // as opposed to project:recent's arbitrary folders picked via file dialog.
    ipcMain.handle('project:bundled', () => {
        if (!fs.existsSync(projectsRootDir)) return [];
        return fs.readdirSync(projectsRootDir, { withFileTypes: true })
            .filter(function (entry) { return entry.isDirectory(); })
            .map(function (entry) { return path.join(projectsRootDir, entry.name); })
            .filter(function (dir) { return fs.existsSync(projectFilePath(dir)); })
            .map(function (dir) {
                const loaded = projectStore.loadProjectFolder(dir);
                const name = (loaded.ok && loaded.project && loaded.project.name) || path.basename(dir);
                return { name: name, path: dir, relativePath: path.relative(appRoot, dir) };
            });
    });

    ipcMain.handle('project:removeRecent', (_event, opts) => {
        const dir = opts && opts.dir;
        if (!dir) return { ok: false };
        const cfg = readConfig();
        cfg.recentProjects = (cfg.recentProjects || []).filter(function (r) { return r.path !== dir; });
        if (cfg.lastProject === dir) delete cfg.lastProject;
        writeConfig(cfg);
        return { ok: true, recentProjects: cfg.recentProjects };
    });

    ipcMain.handle('project:create', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Choose Project Folder',
            properties: ['openDirectory', 'createDirectory']
        });
        if (canceled || !filePaths || !filePaths.length) return { canceled: true };
        const dir = filePaths[0];

        try {
            fs.accessSync(dir, fs.constants.W_OK);
        } catch (e) {
            return { ok: false, error: 'Folder is not writable: ' + dir };
        }

        const existingProjectFile = projectFilePath(dir);
        if (fs.existsSync(existingProjectFile)) {
            const { response } = await dialog.showMessageBox({
                type: 'warning',
                buttons: ['Overwrite', 'Cancel'],
                defaultId: 1,
                cancelId: 1,
                title: 'Project exists',
                message: 'This folder already contains a project.json. Overwrite it?'
            });
            if (response !== 0) return { canceled: true };
        }

        try {
            const templateDest = templateDirPath(dir);
            if (!fs.existsSync(templateDest)) {
                projectStore.copyDefaultTemplate(templateDest);
            }
            projectStore.copyDefaultData(dir);

            const project = {
                version: 2,
                name: path.basename(dir),
                displayMode: 'windows',
                languages: [{ lang_code: 'en' }],
                frames: [{
                    id: 'a',
                    label: 'Main Stage',
                    size: { width: 1920, height: 1080 },
                    position: { monitor: 0, x: null, y: null, fullscreen: false, kiosk: false },
                    ordering: { mode: 'skills', skillNumbers: [], includeAlbertVidal: true }
                }]
            };
            writeJson(translationsFilePath(dir), { version: 1, languages: {} });
            projectStore.writeProjectFiles(dir, project);

            projectStore.setActive(dir, project, templateDest);
            addRecent(dir, project.name);
            return { ok: true, dir, project };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('project:open', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Open Project Folder',
            properties: ['openDirectory']
        });
        if (canceled || !filePaths || !filePaths.length) return { canceled: true };
        const dir = filePaths[0];

        const loaded = projectStore.loadProjectFolder(dir);
        if (!loaded.ok) {
            await dialog.showMessageBox({
                type: 'error',
                title: 'Cannot open project',
                message: loaded.error
            });
            return { ok: false, error: loaded.error };
        }

        let templateDir = loaded.templateDir;
        if (!templateDir) {
            const result = await projectStore.ensureTemplates(dir);
            templateDir = result.templateDir;
            if (result.copyError) {
                await dialog.showMessageBox({ type: 'error', title: 'Copy failed', message: result.copyError.message });
            }
        }

        try {
            projectStore.copyDefaultData(dir);
        } catch (e) {
            // Non-destructive best-effort — wstemplate://project/ falls back to bundled data on a failed copy.
        }

        projectStore.setActive(dir, loaded.project, templateDir);
        addRecent(dir, loaded.project.name || path.basename(dir));
        const orderingWarning = loaded.orderingWarning;
        return orderingWarning
            ? { ok: true, dir, project: loaded.project, orderingWarning }
            : { ok: true, dir, project: loaded.project };
    });

    ipcMain.handle('project:openPath', async (_event, { dir }) => {
        if (!dir || !fs.existsSync(dir)) return { ok: false, code: 'missing', error: 'Path no longer exists.' };

        const loaded = projectStore.loadProjectFolder(dir);
        if (!loaded.ok) return { ok: false, code: loaded.code, error: loaded.error };

        let templateDir = loaded.templateDir;
        if (!templateDir) {
            const result = await projectStore.ensureTemplates(dir);
            templateDir = result.templateDir;
        }

        try {
            projectStore.copyDefaultData(dir);
        } catch (e) {
            // Non-destructive best-effort — wstemplate://project/ falls back to bundled data on a failed copy.
        }

        projectStore.setActive(dir, loaded.project, templateDir);
        addRecent(dir, loaded.project.name || path.basename(dir));
        const orderingWarning = loaded.orderingWarning;
        return orderingWarning
            ? { ok: true, dir, project: loaded.project, orderingWarning }
            : { ok: true, dir, project: loaded.project };
    });

    ipcMain.handle('project:current', () => {
        const dir = projectStore.getActiveProjectDir();
        const project = projectStore.getActiveProject();
        if (!dir || !project) return { dir: null, project: null };
        return { dir, project };
    });

    ipcMain.handle('project:saveCurrent', (_event, project) => {
        const activeProjectDir = projectStore.getActiveProjectDir();
        if (!activeProjectDir) return { ok: false, error: 'No active project open.' };
        try {
            projectStore.writeProjectFiles(activeProjectDir, project);
            projectStore.setActiveProject(project);
            if (project.name) addRecent(activeProjectDir, project.name);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('project:readTranslations', () => {
        const activeProjectDir = projectStore.getActiveProjectDir();
        if (!activeProjectDir) return { ok: false, languages: {} };
        const data = readJson(translationsFilePath(activeProjectDir), { languages: {} });
        return { ok: true, languages: (data && data.languages) || {} };
    });

    ipcMain.handle('project:writeTranslations', (_event, languages) => {
        const activeProjectDir = projectStore.getActiveProjectDir();
        if (!activeProjectDir) return { ok: false, error: 'No active project open.' };
        try {
            writeJson(translationsFilePath(activeProjectDir), { version: 1, languages: languages || {} });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('project:saveAs', async (_event, project) => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Save Project As — Choose Folder',
            properties: ['openDirectory', 'createDirectory']
        });
        if (canceled || !filePaths || !filePaths.length) return { canceled: true };
        const dir = filePaths[0];

        try {
            fs.accessSync(dir, fs.constants.W_OK);
        } catch (e) {
            return { ok: false, error: 'Folder is not writable: ' + dir };
        }

        try {
            const templateDest = templateDirPath(dir);
            const activeTemplateDir = projectStore.getActiveTemplateDir();
            if (!fs.existsSync(templateDest)) {
                if (activeTemplateDir && fs.existsSync(activeTemplateDir)) {
                    fs.cpSync(activeTemplateDir, templateDest, { recursive: true });
                } else {
                    projectStore.copyDefaultTemplate(templateDest);
                }
            }

            const activeProjectDir = projectStore.getActiveProjectDir();
            const sourceTranslations = activeProjectDir && translationsFilePath(activeProjectDir);
            if (sourceTranslations && fs.existsSync(sourceTranslations)) {
                fs.copyFileSync(sourceTranslations, translationsFilePath(dir));
            }

            const sourceData = activeProjectDir && projectDataDir(activeProjectDir);
            if (sourceData && fs.existsSync(sourceData)) {
                fs.cpSync(sourceData, projectDataDir(dir), { recursive: true });
            } else {
                projectStore.copyDefaultData(dir);
            }

            projectStore.writeProjectFiles(dir, project);
            projectStore.setActive(dir, project, templateDest);
            addRecent(dir, project.name || path.basename(dir));
            return { ok: true, dir };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });
}

module.exports = { registerProjectIpc };
