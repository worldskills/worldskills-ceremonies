#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');
var url = require('url');

var options = url.parse('https://api.worldskills.org/results/events/316?published=false');
options.headers = {authorization: 'Bearer 8638a25c-9755-431e-aeb9-bbbbcc13bf9f'};

var file = fs.createWriteStream(__dirname + '/../data/json/results.json');
var request = https.get(options, function(response) {
    response.pipe(file);
});
