#!/usr/bin/env node

'use strict';

var https = require('https');
var fs = require('fs');

var request = https.get('https://api.worldskills.org/org/members?member_of=1&limit=100', function(response) {

    let json = '';

    response.on('data', function (chunk) {
        json += chunk;
    });

    response.on('end', function () {

        var members = JSON.parse(json);
        for (let member of members.members) {

            let code = member.code;
            let url = member.flag.thumbnail + '_medium';

            let file = fs.createWriteStream(__dirname + '/../data/flags/' + code + '.png');
            let request = https.get(url, function(response) {
                response.pipe(file);
            });
        }
    });
});
