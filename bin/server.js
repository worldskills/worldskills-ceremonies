#!/usr/bin/env node

'use strict';

var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');

http.createServer(function (request, response) {

    var parsedUrl = url.parse(request.url);
    var filePath = '.' + parsedUrl.pathname;
    var extname = path.extname(filePath);

    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.svg':
            contentType = 'image/svg+xml';
            break;
    }

    fs.readFile(filePath, function(error, content) {
        response.writeHead(200, {'Content-Type': contentType});
        response.end(content, 'utf-8');
    });

}).listen(8000);
