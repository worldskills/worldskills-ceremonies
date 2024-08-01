#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');

var file = fs.createWriteStream(__dirname + '/../data/json/skills.json');
var request = https.get('https://api.worldskills.org/events/579/skills?sort=name_asc&l=en&limit=100&type=official', function(response) {
    response.pipe(file);
});
