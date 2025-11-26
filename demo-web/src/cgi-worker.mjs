/* eslint-disable no-restricted-globals */
import { PhpCgiWorker } from "php-cgi-wasm/PhpCgiWorker.mjs";
import { PGlite } from '@electric-sql/pglite';

const buildType = process.env.BUILD_TYPE ?? 'dynamic';

const sharedLibs = [];

const files = [
	{ parent: '/preload/test_www/', name: 'hello-world.php',     url: './scripts/hello-world.php' },
	{ parent: '/preload/test_www/', name: 'phpinfo.php',         url: './scripts/phpinfo.php' },
	{ parent: '/preload/',          name: 'list-extensions.php', url: './scripts/list-extensions.php' },
];

if(buildType === 'dynamic')
{
	sharedLibs.push(...(await Promise.all([
		import('php-wasm-libxml'),
		import('php-wasm-dom'),
		import('php-wasm-zlib'),
		import('php-wasm-libzip'),
		import('php-wasm-gd'),
		import('php-wasm-iconv'),
		import('php-wasm-intl'),
		import('php-wasm-openssl'),
		import('php-wasm-mbstring'),
		import('php-wasm-sqlite'),
		import('php-wasm-xml'),
		import('php-wasm-simplexml'),
		import('php-wasm-tidy'),
		import('php-wasm-yaml'),
	])).map(m => m.default));
}
else if(buildType === 'shared')
{
	sharedLibs.push(
		{name: 'libxml2.so',     url: (await import('php-wasm-libxml/libxml2.so'    )).default},
		{name: 'libz.so',        url: (await import('php-wasm-zlib/libz.so'         )).default},
		{name: 'libzip.so',      url: (await import('php-wasm-libzip/libzip.so'     )).default},
		{name: 'libfreetype.so', url: (await import('php-wasm-gd/libfreetype.so'    )).default},
		{name: 'libjpeg.so',     url: (await import('php-wasm-gd/libjpeg.so'        )).default},
		{name: 'libwebp.so',     url: (await import('php-wasm-gd/libwebp.so'        )).default},
		{name: 'libpng.so',      url: (await import('php-wasm-gd/libpng.so'         )).default},
		{name: 'libiconv.so',    url: (await import('php-wasm-iconv/libiconv.so'    )).default},
		{name: 'libicuuc.so',    url: (await import('php-wasm-intl/libicuuc.so'     )).default},
		{name: 'libicutu.so',    url: (await import('php-wasm-intl/libicutu.so'     )).default},
		{name: 'libicutest.so',  url: (await import('php-wasm-intl/libicutest.so'   )).default},
		{name: 'libicuio.so',    url: (await import('php-wasm-intl/libicuio.so'     )).default},
		{name: 'libicui18n.so',  url: (await import('php-wasm-intl/libicui18n.so'   )).default},
		{name: 'libicudata.so',  url: (await import('php-wasm-intl/libicudata.so'   )).default},
		{name: 'libcrypto.so',   url: (await import('php-wasm-openssl/libcrypto.so' )).default},
		{name: 'libssl.so',      url: (await import('php-wasm-openssl/libssl.so'    )).default},
		{name: 'libonig.so',     url: (await import('php-wasm-mbstring/libonig.so'  )).default},
		{name: 'libsqlite3.so',  url: (await import('php-wasm-sqlite/libsqlite3.so' )).default},
		{name: 'libtidy.so',     url: (await import('php-wasm-tidy/libtidy.so'      )).default},
		{name: 'libyaml.so',     url: (await import('php-wasm-yaml/libyaml.so'      )).default},
	);
}
else
{
	sharedLibs.push(
		{name: 'libcrypto.so',   url: (await import(('php-wasm-openssl/libcrypto.so'))).default},
		{name: 'libssl.so',      url: (await import(('php-wasm-openssl/libssl.so'   ))).default},
	);
}

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

const actions = {
	runSql: (php, database, sql) => {
		console.log({database});
		const pglite = new PGlite(database);
		return pglite.query(sql);
	},
	execSql: (php, database, sql) => {
		console.log({database});
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
	},
	vHosts: [
		{
			"pathPrefix": "/php-wasm/cgi-bin/test",
			"directory": "/preload/test_www",
			"entrypoint": "hello-world.php"
		},
	]
});

// Set up the event handlers
self.addEventListener('install',  event => php.handleInstallEvent(event));
self.addEventListener('activate', event => php.handleActivateEvent(event));
self.addEventListener('fetch',    event => php.handleFetchEvent(event));
self.addEventListener('message',  event => php.handleMessageEvent(event));

// Extras
self.addEventListener('install',  event => console.log('Install'));
self.addEventListener('activate', event => console.log('Activate'));
