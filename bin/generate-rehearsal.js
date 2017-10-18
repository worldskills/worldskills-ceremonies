#!/usr/bin/env node

'use strict';

var fs = require('fs');

var filename = __dirname + '/../data/json/results.json';
var json = fs.readFileSync(filename);

var results = JSON.parse(json);

for (let result of results.results) {
    result.skill.id += 98;
}

fs.writeFileSync(filename, JSON.stringify(results));
