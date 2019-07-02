#!/usr/bin/env node

'use strict';

var fs = require('fs');

var filename = __dirname + '/../data/json/results.json';
var json = fs.readFileSync(filename);

var results = JSON.parse(json);

for (let result of results.results) {
    if (result.skill.id < 593) {
        result.skill.id += 111;
    }
}

fs.writeFileSync(filename, JSON.stringify(results));
