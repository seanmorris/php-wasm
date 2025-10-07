/* eslint-disable no-restricted-globals */
import { PhpCgiWorker } from "php-cgi-wasm/PhpCgiWorker.mjs";
import { PGlite } from '@electric-sql/pglite';

import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';
import zlib from 'php-wasm-zlib';
import libzip from 'php-wasm-libzip';
import gd from 'php-wasm-gd';
import iconv from 'php-wasm-iconv';
import intl from 'php-wasm-intl';
import openssl from 'php-wasm-openssl';
import mbstring from 'php-wasm-mbstring';
import sqlite from 'php-wasm-sqlite';
import xml from 'php-wasm-xml';
import simplexml from 'php-wasm-simplexml';

// Log requests
const onRequest = (request, response) => {
	const url = new URL(request.url);
	const logLine = `[${(new Date).toISOString()}]`
		+ `#${php.count} 127.0.0.1 - "${request.method}`
		+ ` ${url.pathname}" - HTTP/1.1 ${response.status}`;

	console.log(logLine);
};

// Formatted 404s
const notFound = request => {
	return new Response(
		`<body><h1>404</h1>${request.url} not found</body>`,
		{status: 404, headers:{'Content-Type': 'text/html'}}
	);
};

const sharedLibs = [
	libxml,
	dom,
	zlib,
	libzip,
	gd,
	iconv,
	intl,
	openssl,
	mbstring,
	sqlite,
	xml,
	simplexml,
];

const files = [
	// { parent: '/preload/', name: 'icudt72l.dat', url: './icudt72l.dat' }
];

const actions = {
	runSql: (php, database, sql) => {
		console.log({database});
		const pglite = new PGlite(database);
		return pglite.query(sql);
	},
	execSql: (php, database, sql) => {
		console.log(database)
		const pglite = new PGlite(database);
		return pglite.exec(sql);
	}
};

// Spawn the PHP-CGI binary
const php = new PhpCgiWorker({
	version: '8.3'
	, onRequest
	, notFound
	, sharedLibs
	, files
	, PGlite
	, actions
	, staticFS: false
	, prefix: '/php-wasm/cgi-bin/'
	, exclude: ['/php-wasm/cgi-bin/~!@', '/php-wasm/cgi-bin/.']
	, docroot: '/persist/www'
	, types: {
		jpeg: 'image/jpeg'
		, jpg: 'image/jpeg'
		, gif: 'image/gif'
		, png: 'image/png'
		, svg: 'image/svg+xml'
	}
});

// Set up the event handlers
self.addEventListener('install',  event => php.handleInstallEvent(event));
self.addEventListener('activate', event => php.handleActivateEvent(event));
self.addEventListener('fetch',    event => php.handleFetchEvent(event));
self.addEventListener('message',  event => php.handleMessageEvent(event));

// Extras
self.addEventListener('install',  event => console.log('Install'));
self.addEventListener('activate', event => console.log('Activate'));
