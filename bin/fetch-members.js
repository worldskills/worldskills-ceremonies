#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');

var file = fs.createWriteStream(__dirname + '/../data/json/members.json');
var request = https.get('https://api.worldskills.org/org/members?member_of=1&sort=1058&limit=100', function(response) {
    response.pipe(file);
});
