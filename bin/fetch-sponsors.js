#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');

var request = https.get('https://api.worldskills.org/events/316/skills?limit=100', function(response) {

    let json = '';

    response.on('data', function (chunk) {
        json += chunk;
    });

    response.on('end', function () {

        var skills = JSON.parse(json);
        for (let skill of skills.skills) {

            for (let sponsor of skill.sponsors) {

                let id = sponsor.id;
                let url = sponsor.logo.thumbnail + '_medium';

                let file = fs.createWriteStream(__dirname + '/../data/sponsors/' + id + '.png');
                let request = https.get(url, function(response) {
                    response.pipe(file);
                });
            }
        }
    });
});
