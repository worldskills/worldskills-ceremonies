#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');

var file = fs.createWriteStream(__dirname + '/../data/json/skills-ru.json');
var request = https.get('https://api.worldskills.org/events/364/skills?sort=sector_name_asc&l=ru_RU&limit=100&type=official', function(response) {
    response.pipe(file);
});
