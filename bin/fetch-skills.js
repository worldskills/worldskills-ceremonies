#!/usr/bin/env node

'use strict';

const https = require('https');
const fs = require('fs');

const projectName = process.argv[2] || 'bare-project';
const eventId = process.argv[3] || '611';
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

function fetchSkills(lang) {
    return new Promise((resolve, reject) => {
        https.get(`https://api.worldskills.org/events/${eventId}/skills?sort=name_asc&l=${lang}&limit=100&type=official`, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body).skills); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    const enSkills = await fetchSkills('en');
    const skills = enSkills.map((skill) => ({
        number: skill.number,
        name: { lang_code: 'en', text: skill.name.text, translations: {} }
    }));

    const otherLanguages = readLanguages().filter((lang) => lang !== 'en');
    for (const lang of otherLanguages) {
        const translated = await fetchSkills(lang);
        translated.forEach((skill) => {
            const match = skills.find((s) => s.number === skill.number);
            if (match) match.name.translations[lang] = skill.name.text;
        });
    }

    fs.writeFileSync(`${projectDir}/data/skills.json`, JSON.stringify(skills, null, 2));
}

main().catch((e) => {
    console.error('Failed to fetch skills:', e.message);
    process.exit(1);
});
