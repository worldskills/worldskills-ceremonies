#!/usr/bin/env node

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

http.createServer(function (request, response) {

    var filePath = '.' + request.url;
    var extname = path.extname(filePath);

    fs.readFile(filePath, function(error, content) {
        response.writeHead(200);
        response.end(content, 'utf-8');
    });

}).listen(8000);
