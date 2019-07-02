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

    fs.readFile(filePath, function(error, content) {
        response.writeHead(200);
        response.end(content, 'utf-8');
    });

}).listen(8000);
