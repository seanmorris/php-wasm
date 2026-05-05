import { PhpCgiWorker } from '/packages/php-cgi-wasm/PhpCgiWorker.mjs';
import { loadCgiSharedLibs } from './harness/runtime-libs.mjs';

const query = new URL(self.location.href).searchParams;
const runtimeVersion = query.get('version') ?? '8.4';
const buildType = query.get('buildType') ?? 'dynamic';

const createNotFoundResponse = request => new Response(
	`<body><h1>404</h1>${request.url} not found</body>`,
	{status: 404, headers: {'Content-Type': 'text/html; charset=utf-8'}}
);

let loader = null;

const init = () => {
	if(loader)
	{
		return loader;
	}

	loader = Promise.resolve(new PhpCgiWorker({
		docroot: '/preload/test_www'
		, files: [
			{
				parent: '/preload/test_www/'
				, name: 'hello-world.php'
				, url: new URL('./fixtures/scripts/hello-world.php', self.location.href)
			}
			, {
				parent: '/preload/test_www/'
				, name: 'phpinfo.php'
				, url: new URL('./fixtures/scripts/phpinfo.php', self.location.href)
			}
			, {
				parent: '/preload/'
				, name: 'list-extensions.php'
				, url: new URL('./fixtures/scripts/list-extensions.php', self.location.href)
			}
		]
		, notFound: createNotFoundResponse
		, prefix: '/php-wasm/cgi-bin/'
		, sharedLibs: loadCgiSharedLibs(buildType)
		, staticFS: true
		, types: {
			html: 'text/html'
			, php: 'text/plain; charset=utf-8'
			, txt: 'text/plain; charset=utf-8'
		}
		, version: runtimeVersion
	}));

	return loader;
};

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('install', async event => (await init()).handleInstallEvent(event));
self.addEventListener('activate', async event => (await init()).handleActivateEvent(event));
self.addEventListener('message', async event => (await init()).handleMessageEvent(event));

self.addEventListener('fetch', event => {
	const url = new URL(event.request.url);

	if(!url.pathname.startsWith('/php-wasm/cgi-bin/'))
	{
		event.respondWith(fetch(event.request));
		return;
	}

	event.respondWith((async () => {
		try
		{
			const php = await init();
			const response = await php.request(event.request);

			return response instanceof Response
				? response
				: new Response(String(response ?? '404 - Not Found.'), {status: 404});
		}
		catch(error)
		{
			return new Response(String(error?.stack ?? error), {
				status: 500
				, headers: {'Content-Type': 'text/plain; charset=utf-8'}
			});
		}
	})());
});
