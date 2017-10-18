#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');
var url = require('url');

// var options = url.parse('https://api.worldskills.org/results/events/316?published=false');
var options = url.parse('https://api.worldskills.org/results/events/10');
options.headers = {authorization: 'Bearer c297529b-54fb-4004-8a70-eed0ea173405'};

var file = fs.createWriteStream(__dirname + '/../data/json/results.json');
var request = https.get(options, function(response) {
    response.pipe(file);
});
