const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { readConfig, writeConfig, addRecent } = require('../config-store');
const projectStore = require('../project-store');

function registerProjectIpc() {
    ipcMain.handle('project:recent', () => {
        const cfg = readConfig();
        return cfg.recentProjects || [];
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

        const existingProjectFile = path.join(dir, 'project.json');
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
            const templateDest = path.join(dir, 'template');
            if (!fs.existsSync(templateDest)) {
                projectStore.copyDefaultTemplate(templateDest);
            }

            const defaultOrdering = {
                version: 1,
                frames: { a: { mode: 'skills', skillNumbers: [], includeAlbertVidal: true } }
            };
            fs.writeFileSync(path.join(dir, 'ordering.json'), JSON.stringify(defaultOrdering, null, 2));
            fs.writeFileSync(path.join(dir, 'translations.json'), JSON.stringify({ version: 1, languages: {} }, null, 2));

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
            fs.writeFileSync(existingProjectFile, JSON.stringify(projectStore.stripOrdering(project), null, 2));

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
            const { response } = await dialog.showMessageBox({
                type: 'question',
                buttons: ['Copy default templates', 'Skip'],
                defaultId: 0,
                title: 'Templates missing',
                message: 'This project has no template/ folder. Copy default templates from the app?'
            });
            if (response === 0) {
                try {
                    const templateDest = path.join(dir, 'template');
                    projectStore.copyDefaultTemplate(templateDest);
                    templateDir = templateDest;
                } catch (e) {
                    await dialog.showMessageBox({ type: 'error', title: 'Copy failed', message: e.message });
                }
            }
        }

        projectStore.setActive(dir, loaded.project, templateDir);
        addRecent(dir, loaded.project.name || path.basename(dir));
        return { ok: true, dir, project: loaded.project };
    });

    ipcMain.handle('project:openPath', async (_event, { dir }) => {
        if (!dir || !fs.existsSync(dir)) return { ok: false, code: 'missing', error: 'Path no longer exists.' };

        const loaded = projectStore.loadProjectFolder(dir);
        if (!loaded.ok) return { ok: false, code: loaded.code, error: loaded.error };

        let templateDir = loaded.templateDir;
        if (!templateDir) {
            const { response } = await dialog.showMessageBox({
                type: 'question',
                buttons: ['Copy default templates', 'Skip'],
                defaultId: 0,
                title: 'Templates missing',
                message: 'This project has no template/ folder. Copy default templates from the app?'
            });
            if (response === 0) {
                try {
                    const templateDest = path.join(dir, 'template');
                    projectStore.copyDefaultTemplate(templateDest);
                    templateDir = templateDest;
                } catch (e) {}
            }
        }

        projectStore.setActive(dir, loaded.project, templateDir);
        addRecent(dir, loaded.project.name || path.basename(dir));
        return { ok: true, dir, project: loaded.project };
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
            fs.writeFileSync(path.join(activeProjectDir, 'ordering.json'), JSON.stringify(projectStore.extractOrdering(project), null, 2));
            const stripped = projectStore.stripOrdering(project);
            fs.writeFileSync(path.join(activeProjectDir, 'project.json'), JSON.stringify(stripped, null, 2));
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
        try {
            const raw = fs.readFileSync(path.join(activeProjectDir, 'translations.json'), 'utf8');
            /**
             * Example shape:
             *
             * {
             *   "version": 1,
             *   "languages": {
             *     "zh_CN": {
             *       "Medal of Excellence": "卓越奖章",
             *       "Gold": "金牌",
             *       "Silver": "银牌",
             *       "Bronze": "铜牌"
             *     }
             *   }
             * }
             */
            const data = JSON.parse(raw);
            return { ok: true, languages: (data && data.languages) || {} };
        } catch (e) {
            return { ok: true, languages: {} };
        }
    });

    ipcMain.handle('project:writeTranslations', (_event, languages) => {
        const activeProjectDir = projectStore.getActiveProjectDir();
        if (!activeProjectDir) return { ok: false, error: 'No active project open.' };
        try {
            const data = { version: 1, languages: languages || {} };
            fs.writeFileSync(path.join(activeProjectDir, 'translations.json'), JSON.stringify(data, null, 2));
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
            const templateDest = path.join(dir, 'template');
            const activeTemplateDir = projectStore.getActiveTemplateDir();
            if (!fs.existsSync(templateDest)) {
                if (activeTemplateDir && fs.existsSync(activeTemplateDir)) {
                    fs.cpSync(activeTemplateDir, templateDest, { recursive: true });
                } else {
                    projectStore.copyDefaultTemplate(templateDest);
                }
            }

            const activeProjectDir = projectStore.getActiveProjectDir();
            const sourceTranslations = activeProjectDir && path.join(activeProjectDir, 'translations.json');
            if (sourceTranslations && fs.existsSync(sourceTranslations)) {
                fs.copyFileSync(sourceTranslations, path.join(dir, 'translations.json'));
            }

            fs.writeFileSync(path.join(dir, 'ordering.json'), JSON.stringify(projectStore.extractOrdering(project), null, 2));
            const strippedSaveAs = projectStore.stripOrdering(project);
            fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(strippedSaveAs, null, 2));
            projectStore.setActive(dir, project, templateDest);
            addRecent(dir, project.name || path.basename(dir));
            return { ok: true, dir };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });
}

module.exports = { registerProjectIpc };
