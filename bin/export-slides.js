#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 7680;
const MAX_HEIGHT = 4320;
const MAX_JOBS = 500;
const SLIDE_TYPES = ['callup', 'medals', 'mfe', 'best-of-nation'];

const HELP = `Usage:
  npm run export:slides -- \\
    --project <project-folder> \\
    --results <results.xlsx> \\
    --best-of-nation <best-of-nation.xlsx> \\
    --output <parent-folder> \\
    [--slides callup,medals,mfe,best-of-nation] \\
    [--width ${DEFAULT_WIDTH}] [--height ${DEFAULT_HEIGHT}]

Exports fully revealed transparent fill PNGs and grayscale key PNGs.`;

class InputError extends Error {}

function parseArgs(argv) {
    const values = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, slides: 'all' };
    const known = new Set(['project', 'results', 'best-of-nation', 'output', 'slides', 'width', 'height']);

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--help' || token === '-h') {
            return { help: true };
        }
        if (!token.startsWith('--')) {
            throw new InputError('Unexpected argument: ' + token);
        }

        const separator = token.indexOf('=');
        const name = token.slice(2, separator < 0 ? undefined : separator);
        if (!known.has(name)) {
            throw new InputError('Unknown option: --' + name);
        }
        const value = separator < 0 ? argv[++i] : token.slice(separator + 1);
        if (value == null || value === '') {
            throw new InputError('Missing value for --' + name + '.');
        }
        values[name] = value;
    }

    values.slides = values.slides
        .split(',')
        .map(function (type) {
            return type.trim().toLowerCase();
        })
        .filter(Boolean);
    if (values.slides.length === 1 && values.slides[0] === 'all') values.slides = SLIDE_TYPES.slice();
    if (
        !values.slides.length ||
        values.slides.some(function (type) {
            return SLIDE_TYPES.indexOf(type) < 0;
        })
    ) {
        throw new InputError('Slides must be a comma-separated list of: ' + SLIDE_TYPES.join(', ') + '.');
    }
    values.slides = Array.from(new Set(values.slides));

    ['project', 'output'].forEach(function (name) {
        if (!values[name]) throw new InputError('Missing required option --' + name + '.');
    });
    if (
        values.slides.some(function (type) {
            return type !== 'best-of-nation';
        }) &&
        !values.results
    ) {
        throw new InputError('Missing required option --results.');
    }
    if (values.slides.indexOf('best-of-nation') >= 0 && !values['best-of-nation']) {
        throw new InputError('Missing required option --best-of-nation.');
    }

    values.width = Number(values.width);
    values.height = Number(values.height);
    if (
        !Number.isInteger(values.width) ||
        values.width < MIN_WIDTH ||
        values.width > MAX_WIDTH ||
        !Number.isInteger(values.height) ||
        values.height < MIN_HEIGHT ||
        values.height > MAX_HEIGHT
    ) {
        throw new InputError(
            'Dimensions must be whole pixels between ' +
                MIN_WIDTH +
                '×' +
                MIN_HEIGHT +
                ' and ' +
                MAX_WIDTH +
                '×' +
                MAX_HEIGHT +
                '.'
        );
    }

    ['project', 'results', 'best-of-nation', 'output'].forEach(function (name) {
        if (values[name]) values[name] = path.resolve(values[name]);
    });
    return values;
}

function safeSegment(value, fallback) {
    let result = String(value || '')
        .normalize('NFKC')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/[ .]+$/g, '')
        .trim();
    if (!result) result = fallback;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
    return result.slice(0, 180).replace(/[ .]+$/g, '') || fallback;
}

function safePngFilename(value) {
    const raw = String(value || '').replace(/\.png$/i, '');
    return safeSegment(raw, 'slide') + '.png';
}

function uniqueFilename(value, used) {
    const safe = safePngFilename(value);
    const extension = '.png';
    const base = safe.slice(0, -extension.length);
    let candidate = safe;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
        candidate = base + '-' + suffix++ + extension;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

function timestamp(date) {
    function pad(number) {
        return String(number).padStart(2, '0');
    }
    return (
        date.getFullYear() +
        pad(date.getMonth() + 1) +
        pad(date.getDate()) +
        '-' +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds())
    );
}

function createExportDirectory(parent, projectName, date) {
    fs.mkdirSync(parent, { recursive: true });
    const base = safeSegment(projectName, 'ceremony') + '-slides-' + timestamp(date || new Date());
    for (let suffix = 1; ; suffix++) {
        const candidate = path.join(parent, suffix === 1 ? base : base + '-' + suffix);
        try {
            fs.mkdirSync(candidate);
            return candidate;
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    }
}

function assertFile(filename, label) {
    let stat;
    try {
        stat = fs.statSync(filename);
    } catch (_error) {
        throw new InputError(label + ' does not exist: ' + filename);
    }
    if (!stat.isFile()) throw new InputError(label + ' is not a file: ' + filename);
}

function readRows(filename, requiredColumns, label) {
    assertFile(filename, label);
    let workbook;
    try {
        workbook = XLSX.readFile(filename);
    } catch (error) {
        throw new InputError(label + ' could not be read: ' + error.message);
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { raw: false }) : [];
    if (!rows.length) throw new InputError(label + ' contains no rows.');
    const missing = requiredColumns.filter(function (column) {
        return !Object.prototype.hasOwnProperty.call(rows[0], column);
    });
    if (missing.length) throw new InputError(label + ' is missing column(s): ' + missing.join(', ') + '.');
    return rows;
}

function readJson(filename, label) {
    try {
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch (error) {
        throw new InputError(label + ' could not be read: ' + error.message);
    }
}

function javascriptJson(value) {
    return JSON.stringify(JSON.stringify(value))
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

async function buildJobs(BrowserWindow, appRoot, input) {
    const win = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false },
    });
    try {
        await win.loadFile(path.join(appRoot, 'src', 'views', 'slide-export.html'));
        const available = await win.webContents.executeJavaScript('typeof window.buildSlideExportJobs === "function"');
        if (!available) throw new Error('The slide catalog coordinator did not start.');
        const jobs = await win.webContents.executeJavaScript(
            'window.buildSlideExportJobs(JSON.parse(' + javascriptJson(input) + '))'
        );
        return { jobs: jobs, window: win };
    } catch (error) {
        if (!win.isDestroyed()) win.destroy();
        throw error;
    }
}

async function createRenderWindow(BrowserWindow, appRoot, baseWebPreferences, markWindow, width, height, feedType) {
    const win = new BrowserWindow({
        width: width,
        height: height,
        useContentSize: true,
        frame: false,
        show: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: baseWebPreferences({ backgroundThrottling: false, ceremonatorRole: 'output' }),
    });
    markWindow(win, 'output');
    await win.loadFile(path.join(appRoot, 'src', 'views', 'screen.html'), {
        search: 'screen=export&export=1&feedType=' + encodeURIComponent(feedType || 'main'),
    });
    const available = await win.webContents.executeJavaScript('typeof window.__ceremonatorRenderExport === "function"');
    if (!available) {
        win.destroy();
        throw new Error('The slide renderer did not start in export mode.');
    }
    return win;
}

async function captureJobs(win, jobs, outputDir, width, height) {
    const used = new Set();
    const failures = [];
    let exported = 0;

    async function capturePng() {
        const image = await win.webContents.capturePage({ x: 0, y: 0, width: width, height: height });
        const png = image.resize({ width: width, height: height, quality: 'best' }).toPNG({ scaleFactor: 1 });
        const pngWidth = png.readUInt32BE(16);
        const pngHeight = png.readUInt32BE(20);
        if (pngWidth !== width || pngHeight !== height) {
            throw new Error('encoded ' + pngWidth + '×' + pngHeight + ' instead of ' + width + '×' + height);
        }
        return png;
    }

    for (let index = 0; index < jobs.length; index++) {
        const job = jobs[index];
        const filename = uniqueFilename(job.filename, used);
        const keyFilename = uniqueFilename(filename.replace(/\.png$/i, '-key.png'), used);
        try {
            await win.webContents.executeJavaScript(
                'window.__ceremonatorRenderExport(JSON.parse(' + javascriptJson(job.payload) + '))'
            );
            fs.writeFileSync(path.join(outputDir, filename), await capturePng());
            await win.webContents.executeJavaScript('window.__ceremonatorSetExportKey(true)');
            try {
                fs.writeFileSync(path.join(outputDir, keyFilename), await capturePng());
            } finally {
                await win.webContents.executeJavaScript('window.__ceremonatorSetExportKey(false)');
            }
            exported++;
            console.log('[' + exported + '/' + jobs.length + '] ' + filename + ' + ' + keyFilename);
        } catch (error) {
            failures.push({ filename: filename, error: error.message });
            console.error('Failed ' + filename + ': ' + error.message);
        }
    }
    return { exported: exported, failures: failures };
}

async function runExport(options, input) {
    const { app, BrowserWindow } = require('electron');
    const { registerTemplateScheme, registerTemplateProtocol } = require('../src/main/template-protocol');
    const { registerProjectIpc } = require('../src/main/ipc/project');
    const { registerAppIpc } = require('../src/main/ipc/app');
    const projectStore = require('../src/main/project-store');
    const { appRoot } = require('../src/main/paths');
    const { baseWebPreferences } = require('../src/main/window-factory');
    const { markWindow } = require('../src/main/ipc/sender-role');

    registerTemplateScheme();
    registerProjectIpc();
    registerAppIpc();

    let coordinatorWindow;
    let renderWindow;
    try {
        await app.whenReady();
        registerTemplateProtocol();

        const loaded = projectStore.loadProjectFolder(options.project);
        if (!loaded.ok) throw new InputError('Project could not be loaded: ' + loaded.error);
        if (!loaded.templateDir) throw new InputError('Project has no template folder: ' + options.project);
        projectStore.setActive(options.project, loaded.project, loaded.templateDir);

        input.project = loaded.project;
        input.skills = readJson(path.join(options.project, 'data', 'skills.json'), 'skills.json');
        input.members = readJson(path.join(options.project, 'data', 'members.json'), 'members.json');

        const coordinator = await buildJobs(BrowserWindow, appRoot, input);
        const built = coordinator.jobs;
        coordinatorWindow = coordinator.window;
        if (!built || !Array.isArray(built.jobs) || built.jobs.length > MAX_JOBS) {
            throw new Error('The catalog returned an invalid export job list.');
        }
        if (!built.jobs.length) throw new InputError('No requested slides could be built from the input files.');
        if (options.slides.indexOf('best-of-nation') >= 0 && !built.bestOfNationCount) {
            throw new InputError('No Best of Nation slides matched the project member data.');
        }

        renderWindow = await createRenderWindow(
            BrowserWindow,
            appRoot,
            baseWebPreferences,
            markWindow,
            options.width,
            options.height,
            projectStore.primaryFeedId()
        );
        const outputDir = createExportDirectory(options.output, loaded.project.name, new Date());
        const result = await captureJobs(renderWindow, built.jobs, outputDir, options.width, options.height);

        console.log(
            'Exported ' + result.exported + ' of ' + built.jobs.length + ' fill/key pair(s) to ' + outputDir + '.'
        );
        if (built.skipped && built.skipped.length) {
            console.log('Skipped ' + built.skipped.length + ' unavailable skill slide(s).');
        }
        if (result.failures.length) {
            console.error(result.failures.length + ' slide(s) failed; successful PNGs were kept.');
            return 1;
        }
        return 0;
    } finally {
        if (renderWindow && !renderWindow.isDestroyed()) renderWindow.destroy();
        if (coordinatorWindow && !coordinatorWindow.isDestroyed()) coordinatorWindow.destroy();
    }
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
        if (options.help) {
            console.log(HELP);
            return 0;
        }
        if (!fs.existsSync(options.project) || !fs.statSync(options.project).isDirectory()) {
            throw new InputError('Project folder does not exist: ' + options.project);
        }
        const results = options.results
            ? readRows(options.results, ['Skill Number', 'Medal', 'First Name', 'Last Name'], 'Results spreadsheet')
            : [];
        const bestOfNation = options['best-of-nation']
            ? readRows(
                  options['best-of-nation'],
                  ['Member', 'Member Name', 'First Name', 'Last Name'],
                  'Best of Nation spreadsheet'
              )
            : [];
        return await runExport(options, {
            results: results,
            bestOfNation: bestOfNation,
            slideTypes: options.slides,
        });
    } catch (error) {
        console.error(error.message);
        if (error instanceof InputError) {
            console.error('\n' + HELP);
            return 2;
        }
        return 1;
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then(function (code) {
        require('electron').app.exit(code);
    });
}

module.exports = {
    InputError,
    createExportDirectory,
    parseArgs,
    safePngFilename,
    timestamp,
    uniqueFilename,
};
