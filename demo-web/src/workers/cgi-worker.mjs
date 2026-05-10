/**
 * Service worker entrypoint that boots php-cgi-wasm and handles demo requests.
 */
import { PhpCgiWorker } from "php-cgi-wasm/PhpCgiWorker.mjs";
import { PGlite } from '@electric-sql/pglite';
import { basePath, buildType } from '../lib/runtimePaths.worker.js';
import { sharedSupportLibs } from 'demo-web-shared-support-libs';

const sharedLibs = [];

const files = [
	{ parent: '/preload/test_www/', name: 'hello-world.php',     url: './scripts/hello-world.php' }
	, { parent: '/preload/test_www/', name: 'phpinfo.php',         url: './scripts/phpinfo.php' }
	, { parent: '/preload/',          name: 'list-extensions.php', url: './scripts/list-extensions.php' }
];

/**
 * Emits an access-log style line for each handled CGI request.
 */
const onRequest = (request, response) => {
	const url = new URL(request.url);
	const logLine = `[${(new Date).toISOString()}]`
		+ `127.0.0.1 - "${request.method}`
		+ ` ${url.pathname}" - HTTP/1.1 ${response.status}`;

	console.log(logLine);
};

/**
 * Returns a simple HTML 404 response for unmatched worker routes.
 */
const notFound = request => {
	return new Response(
		`<body><h1>404</h1>${request.url} not found</body>`,
		{status: 404, headers:{'Content-Type': 'text/html'}}
	);
};

const actions = {
	runSql: (php, database, sql) => {
		console.log({database});
		const pglite = new PGlite(database);
		return pglite.query(sql);
	}
	, execSql: (php, database, sql) => {
		console.log({database});
		const pglite = new PGlite(database);
		return pglite.exec(sql);
	}
};

let phpLoader = null;

/**
 * Loads the runtime assets required for the current build type and creates the worker.
 */
const init = async () => {
	if(phpLoader) return phpLoader;

	if(buildType === 'dynamic')
	{
		sharedLibs.push(...(await Promise.all([
			import('php-wasm-libxml')
			, import('php-wasm-dom')
			, import('php-wasm-zlib')
			, import('php-wasm-libzip')
			, import('php-wasm-gd')
			, import('php-wasm-iconv')
			, import('php-wasm-intl')
			, import('php-wasm-openssl')
			, import('php-wasm-mbstring')
			, import('php-wasm-sqlite')
			, import('php-wasm-xml')
			, import('php-wasm-simplexml')
			, import('php-wasm-tidy')
			, import('php-wasm-yaml')
		])).map(m => m.default));
	}
	else if(buildType === 'shared')
	{
		sharedLibs.push(...sharedSupportLibs);
	}

	// Spawn the PHP-CGI binary
	return phpLoader = new PhpCgiWorker({
		version: '8.3'
		, onRequest
		, notFound
		, sharedLibs
		, files
		, PGlite
		, actions
		, staticFS: false
		, prefix: basePath('cgi-bin/')
		, exclude: [basePath('cgi-bin/~!@'), basePath('cgi-bin/.')]
		, docroot: '/persist/www'
		, types: {
			jpeg: 'image/jpeg'
			, jpg: 'image/jpeg'
			, gif: 'image/gif'
			, png: 'image/png'
			, svg: 'image/svg+xml'
		}
		, vHosts: [
			{
				"pathPrefix": basePath('cgi-bin/test')
				, "directory": "/preload/test_www"
				, "entrypoint": "hello-world.php"
			}
		]
	});
};

// Set up the event handlers
self.addEventListener('install', event => event.waitUntil(globalThis.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(globalThis.clients.claim()));
self.addEventListener('fetch',    async event => (await init()).handleFetchEvent(event));
self.addEventListener('message',  async event => (await init()).handleMessageEvent(event));

// Extras
self.addEventListener('install',  () => console.log('Install'));
self.addEventListener('activate', () => console.log('Activate'));
