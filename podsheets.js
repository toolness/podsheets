const url = require('url');
const fs = require('fs');
const http = require('http');
const _ = require('underscore');
const GoogleSpreadsheet = require('google-spreadsheet-stream');

const TEST_KEY = '0AjLje2rCgZrAdHJFQ0RseGhHbGRzRmxPNUtuQ3RpeXc';
const TEST_SHEET_ID = 'od5';

const PORT = process.env['PORT'] || 3000;
const DEBUG = 'DEBUG' in process.env;
const SPREADSHEET_PATH = /^\/([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)$/;
const VALID_URL = /^https?:\/\//;
const GENERATOR = 'podsheets.js';

var indexHTML;

function esc(text) {
  return _.escape(text);
}

function cdata(text) {
  if (text.indexOf(']]>') != -1) return esc(text);
  return '<![CDATA[' + text + ']]>';
}

function getIndexPage(res) {
  if ((!indexHTML) || DEBUG)
    indexHTML = fs.readFileSync(__dirname + '/index.html', 'utf-8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(indexHTML);
}

function getRSSFeed(key, id, res) {
  function emit(line) {
    res.write(line);
    res.write('\n');
  }

  function writePreamble() {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/rss+xml');
    emit('<?xml version="1.0" encoding="UTF-8"?>');
    emit('<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
         'version="2.0">');
  }

  var spreadsheet = new GoogleSpreadsheet(key);
  var seenFirstRow = false;

  spreadsheet.getRows(id)
    .on('error', function(err) {
      if (seenFirstRow)
        res.end();
      else {
        res.statusCode = 404;
        return res.end('Spreadsheet with key ' + key + ' and id ' + id +
                       ' not found');
      }
    })
    .on('data', function(data) {
      var row = {
        title: data[0] || '',
        date: data[1] ? new Date(Date.parse(data[1])) : new Date(),
        desc: data[2] || '',
        siteURL: data[3] || '',
        mediaURL: data[4] || ''
      };
      if (!VALID_URL.test(row.siteURL)) return;
      if (!seenFirstRow) {
        writePreamble();
        emit('  <channel>');
        emit('    <title>' + esc(row.title) + '</title>');
        emit('    <description>' + cdata(row.desc) + '</description>');
        emit('    <generator>' + esc(GENERATOR) + '</generator>');
        emit('    <lastBuildDate>' + new Date().toUTCString() +
                 '</lastBuildDate>');
        if (VALID_URL.test(row.mediaURL)) {
          emit('    <image>');
          emit('      <url>' + esc(row.mediaURL) + '</url>');
          emit('      <title>' + esc(row.title) + '</title>');
          emit('      <link>' + esc(row.siteURL) + '</link>');
          emit('    </image>');
        }
        seenFirstRow = true;
      } else {
        emit('    <item>');
        emit('      <title>' + esc(row.title) + '</title>');
        emit('      <pubDate>' + esc(row.date.toUTCString()) + '</pubDate>');
        emit('      <description>' + cdata(row.desc) + '</description>');
        emit('      <link>' + esc(row.siteURL) + '</link>');
        emit('      <guid>' + esc(row.mediaURL || row.siteURL) + '</guid>');
        if (VALID_URL.test(row.mediaURL))
          emit('      <enclosure url="' + esc(row.mediaURL) + '"/>');
        emit('    </item>');
      }
    })
    .on('end', function() {
      if (seenFirstRow)
        emit('  </channel>');
      else
        writePreamble();
      emit('</rss>');
      res.end();
    });
}

http.createServer(function(req, res) {
  var urlInfo = url.parse(req.url);
  var sheetMatch = urlInfo.pathname.match(SPREADSHEET_PATH);

  if (sheetMatch)
    return getRSSFeed(sheetMatch[1], sheetMatch[2], res);

  if (urlInfo.pathname == '/')
    return getIndexPage(res);

  res.statusCode = 404;
  res.end('Not Found: ' + urlInfo.pathname);
}).listen(PORT, function() {
  console.log("listening on port " + PORT);
});
