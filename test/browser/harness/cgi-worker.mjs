import { PhpCgiWorker } from '/packages/php-cgi-wasm/PhpCgiWorker.mjs';
import { loadCgiSharedLibs } from '/php-wasm/harness/runtime-libs.mjs';

const query = new URL(self.location.href).searchParams;
const runtimeVersion = query.get('version') ?? '8.4';
const buildType = query.get('buildType') ?? 'dynamic';

const createNotFoundResponse = request => new Response(
	`<body><h1>404</h1>${request.url} not found</body>`,
	{status: 404, headers: {'Content-Type': 'text/html; charset=utf-8'}}
);

let loader = null;
const prefix = '/php-wasm/cgi-bin/';
const testPath = `${prefix}test`;

const init = () => {
	if(loader)
	{
		return loader;
	}

	loader = Promise.resolve(new PhpCgiWorker({
		docroot: '/persist/www'
		, exclude: [`${prefix}~!@`, `${prefix}.`]
		, files: [
			{
				parent: '/preload/test_www/'
				, name: 'hello-world.php'
				, url: new URL('/php-wasm/fixtures/scripts/hello-world.php', self.location.origin)
			}
			, {
				parent: '/preload/test_www/'
				, name: 'phpinfo.php'
				, url: new URL('/php-wasm/fixtures/scripts/phpinfo.php', self.location.origin)
			}
			, {
				parent: '/preload/'
				, name: 'list-extensions.php'
				, url: new URL('/php-wasm/fixtures/scripts/list-extensions.php', self.location.origin)
			}
		]
		, notFound: createNotFoundResponse
		, prefix
		, sharedLibs: loadCgiSharedLibs(buildType)
		, staticFS: false
		, types: {
			html: 'text/html'
			, php: 'text/plain; charset=utf-8'
			, txt: 'text/plain; charset=utf-8'
		}
		, vHosts: [
			{
				pathPrefix: testPath
				, directory: '/preload/test_www'
				, entrypoint: 'hello-world.php'
			}
		]
		, version: runtimeVersion
	}));

	return loader;
};

self.addEventListener('install', async event => (await init()).handleInstallEvent(event));
self.addEventListener('activate', async event => (await init()).handleActivateEvent(event));
self.addEventListener('fetch', async event => (await init()).handleFetchEvent(event));
self.addEventListener('message', async event => (await init()).handleMessageEvent(event));
