#!/usr/bin/env node

'use strict';

const https = require('https');
const fs = require('fs');

const projectName = process.argv[2] || 'bare-project';
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

function fetchMembers(lang) {
    return new Promise((resolve, reject) => {
        https.get(`https://api.worldskills.org/org/members?member_of=1&sort=1058&limit=100&l=${lang}`, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body).members); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function fetchFlag(member) {
    return new Promise((resolve, reject) => {
        if (!member.flag || !member.flag.thumbnail) return resolve();
        const file = fs.createWriteStream(`${projectDir}/data/flags/${member.code}.png`);
        file.on('finish', resolve);
        file.on('error', reject);
        https.get(`${member.flag.thumbnail}_medium`, (response) => { response.pipe(file); }).on('error', reject);
    });
}

async function main() {
    // English fetch doubles as the flag source (code + flag.thumbnail) — no need to hit the
    // members endpoint again just for that.
    const enMembers = await fetchMembers('en');
    const members = enMembers.map((member) => ({
        code: member.code,
        name: { lang_code: 'en', text: member.name.text, translations: {} }
    }));

    const otherLanguages = readLanguages().filter((lang) => lang !== 'en');
    for (const lang of otherLanguages) {
        const translated = await fetchMembers(lang);
        translated.forEach((member) => {
            const match = members.find((m) => m.code === member.code);
            if (match) match.name.translations[lang] = member.name.text;
        });
    }

    fs.writeFileSync(`${projectDir}/data/members.json`, JSON.stringify(members, null, 2));
    await Promise.all(enMembers.map(fetchFlag));
}

main().catch((e) => {
    console.error('Failed to fetch members:', e.message);
    process.exit(1);
});
