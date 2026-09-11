#!/usr/bin/env node

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const projectName = process.argv[2] || 'bare-project';
const eventId = process.argv[3] || '611';
// An event may have the current skill catalogue but no sponsor assignments yet.
// Supplying a third event ID imports sponsors by skill number from that event.
const sponsorEventId = process.argv[4] || eventId;
const projectDir = `${__dirname}/../projects/${projectName}`;

function readLanguages() {
    try {
        const project = JSON.parse(fs.readFileSync(`${projectDir}/project.json`, 'utf8'));
        const codes = (project.languages || []).map((l) => l.lang_code).filter(Boolean);
        return codes.length ? codes : ['en'];
    } catch (e) {
        return ['en'];
    }
}

function fetchSkills(sourceEventId, lang) {
    return new Promise((resolve, reject) => {
        https
            .get(
                `https://api.worldskills.org/events/${sourceEventId}/skills?sort=name_asc&l=${lang}&limit=100&type=official`,
                (response) => {
                    let body = '';
                    response.on('data', (chunk) => {
                        body += chunk;
                    });
                    response.on('end', () => {
                        try {
                            resolve(JSON.parse(body).skills);
                        } catch (e) {
                            reject(e);
                        }
                    });
                }
            )
            .on('error', reject);
    });
}

function extensionFor(contentType, url) {
    const type = String(contentType || '')
        .split(';')[0]
        .toLowerCase();
    const byType = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'image/gif': 'gif',
    };
    if (byType[type]) {
        return byType[type];
    }
    const match = String(url || '').match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : 'img';
}

function download(url, redirects) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (response) => {
                if (
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location &&
                    redirects < 5
                ) {
                    response.resume();
                    return resolve(download(new URL(response.headers.location, url).toString(), redirects + 1));
                }
                if (response.statusCode !== 200) {
                    response.resume();
                    return reject(new Error('HTTP ' + response.statusCode));
                }
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () =>
                    resolve({ body: Buffer.concat(chunks), type: response.headers['content-type'] })
                );
            })
            .on('error', reject);
    });
}

async function main() {
    const skillsPath = path.join(projectDir, 'data', 'skills.json');
    const previousSkills = fs.existsSync(skillsPath) ? JSON.parse(fs.readFileSync(skillsPath, 'utf8')) : [];
    const backgrounds = new Map();
    for (const skill of previousSkills) {
        for (const sponsor of skill.sponsors || []) {
            if (sponsor.logo && sponsor.logo.backgroundColor != null) {
                backgrounds.set(String(sponsor.logo.id), sponsor.logo.backgroundColor);
            }
        }
    }
    const enSkills = await fetchSkills(eventId, 'en');
    const sponsorSkills = sponsorEventId === eventId ? enSkills : await fetchSkills(sponsorEventId, 'en');
    const sponsorsByNumber = new Map(
        sponsorSkills.map((skill) => [skill.number, Array.isArray(skill.sponsors) ? skill.sponsors : []])
    );
    const skills = enSkills.map((skill) => ({
        number: skill.number,
        name: { lang_code: 'en', text: skill.name.text, translations: {} },
        // Preserve source-event sponsor records; local logo settings are added below.
        // Import only featured sponsors with sort=0
        sponsors: (sponsorsByNumber.get(skill.number) || []).filter((e) => e.sort === 0),
    }));

    const otherLanguages = readLanguages().filter((lang) => lang !== 'en');
    for (const lang of otherLanguages) {
        const translated = await fetchSkills(eventId, lang);
        translated.forEach((skill) => {
            const match = skills.find((s) => s.number === skill.number);
            if (match) {
                match.name.translations[lang] = skill.name.text;
            }
        });
    }

    const logosDir = path.join(projectDir, 'data', 'sponsors');
    fs.mkdirSync(logosDir, { recursive: true });
    // Cache transfer results by URL, but name the local artifact by its logo ID.
    // One URL is fetched at most once even when it is attached to several skills.
    const downloaded = new Map();
    const written = new Set();
    for (const skill of skills) {
        for (const sponsor of skill.sponsors) {
            const logo = sponsor && sponsor.logo;
            if (logo && backgrounds.has(String(logo.id))) {
                logo.backgroundColor = backgrounds.get(String(logo.id));
            }
            const url = logo && logo.thumbnail;
            if (!url) {
                if (logo) {
                    delete logo.local;
                }
                continue;
            }
            const id = String(logo.id == null ? '' : logo.id).replace(/[^a-z0-9_-]/gi, '');
            if (!id) {
                delete logo.local;
                console.warn('Could not cache sponsor logo for skill ' + skill.number + ': logo has no usable ID');
                continue;
            }
            try {
                let transfer = downloaded.get(url);
                if (!transfer) {
                    transfer = download(url, 0);
                    downloaded.set(url, transfer);
                }
                const result = await transfer;
                const local = 'sponsors/' + id + '.' + extensionFor(result.type, url);
                const target = path.join(projectDir, 'data', local);
                if (!written.has(target)) {
                    fs.writeFileSync(target, result.body);
                    written.add(target);
                }
                logo.local = local;
            } catch (error) {
                console.warn('Could not download sponsor logo for skill ' + skill.number + ': ' + error.message);
                delete logo.local;
            }
        }
    }

    fs.writeFileSync(skillsPath, JSON.stringify(skills, null, 2));
}

main().catch((e) => {
    console.error('Failed to fetch skills:', e);
    process.exit(1);
});
