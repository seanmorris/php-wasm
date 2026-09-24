import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PhpCgiBase } from '../source/PhpCgiBase.mjs';

const responseBytes = new TextEncoder().encode('Content-Type: text/plain\r\n\r\nOK');

const createCgi = async ({failures = 0, rejectMain = false, failure = new Error('Aborted(invalid state: 1)'), options = {}} = {}) => {
	const runtimes = [];
	const paths = new Map([
		['/preload', {isFolder: true, mode: 'directory'}]
		, ['/www', {isFolder: true, mode: 'directory'}]
		, ['/www/index.php', {isFolder: false, mode: 'file'}]
		, ['/www/wp-admin', {isFolder: true, mode: 'directory'}]
		, ['/www/wp-admin/index.php', {isFolder: false, mode: 'file'}]
		, ['/www/app.phar', {isFolder: false, mode: 'file'}]
		, ['/www/assets.css', {isFolder: false, mode: 'file'}]
		, ['/www/folder.phar', {isFolder: true, mode: 'directory'}]
		, ['/www/folder.phar/index.php', {isFolder: false, mode: 'file'}]
	]);

	const loader = Promise.resolve({
		default: args => {
			const env = new Map;
			const runtime = {
				env
				, requests: 0
				, FS: {
					analyzePath: path => {
						const normalizedPath = path.length > 1 && path.endsWith('/')
							? path.slice(0, -1)
							: path;
						const object = paths.get(normalizedPath);

						return object ? {exists: true, object} : {exists: false};
					}
					, createPreloadedFile: async () => undefined
					, isFile: mode => mode === 'file'
					, isDir: mode => mode === 'directory'
					, mkdir: () => undefined
					, readFile: () => ''
					, writeFile: () => undefined
				}
				, ccall: (name, returnType, argTypes, values) => {
					if(name === 'wasm_sapi_cgi_putenv')
					{
						env.set(values[0], values[1]);
					}
					else if(name === 'wasm_sapi_cgi_main')
					{
						++runtime.requests;
						if(failures-- > 0)
						{
							if(rejectMain) return Promise.reject(failure);
							throw failure;
						}

						for(const byte of responseBytes)
						{
							args.stdout(byte);
						}
					}

					return 0;
				}
			};

			runtimes.push(runtime);

			return runtime;
		}
	});

	const cgi = new PhpCgiBase(loader, {
		version: '8.3'
		, prefix: '/cgi-bin/'
		, docroot: '/unused'
		, vHosts: [{
			pathPrefix: '/cgi-bin/site'
			, directory: '/www'
			, entrypoint: 'index.php'
		}]
		, ...options
	});

	await cgi.binary;

	return {cgi, runtimes};
};

/**
 * Suppresses expected runtime diagnostics in Node and Deno tests.
 * @param {() => Promise<void>} callback Test body.
 * @returns {Promise<void>} Completion of the test body.
 */
const withQuietConsole = async callback => {
	const originalError = console.error;
	const originalWarn = console.warn;
	console.error = () => undefined;
	console.warn = () => undefined;
	try
	{
		await callback();
	}
	finally
	{
		console.error = originalError;
		console.warn = originalWarn;
	}
};

test('CGI directory requests resolve index.php and retain directory request semantics', async () => {
	const {cgi, runtimes} = await createCgi();

	let response = await cgi.request(new Request('http://localhost/cgi-bin/site'));

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'OK');
	assert.equal(runtimes.at(-1).env.get('REQUEST_URI'), '/cgi-bin/site/');
	assert.equal(runtimes.at(-1).env.get('SCRIPT_NAME'), '/cgi-bin/site/index.php');
	assert.equal(runtimes.at(-1).env.get('SCRIPT_FILENAME'), '/www/index.php');

	response = await cgi.request(new Request('http://localhost/cgi-bin/site/wp-admin/'));

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'OK');
	assert.equal(runtimes.at(-1).env.get('REQUEST_URI'), '/cgi-bin/site/wp-admin/');
	assert.equal(runtimes.at(-1).env.get('SCRIPT_NAME'), '/cgi-bin/site/wp-admin/index.php');
	assert.equal(runtimes.at(-1).env.get('SCRIPT_FILENAME'), '/www/wp-admin/index.php');
});

test('CGI routes Phar members through the archive with URL-based script names', async () => {
	for(const vHosts of [[], [{pathPrefix: '/cgi-bin/site', directory: '/www'}]])
	{
		const {cgi, runtimes} = await createCgi({options: {docroot: '/www', vHosts}});
		const prefix = vHosts.length ? '/cgi-bin/site' : '/cgi-bin';

		for(const pathInfo of ['', '/', '/index.php', '/nested/hello.txt', '/nested/'])
		{
			const pathname = `${prefix}/app.phar${pathInfo}`;
			const response = await cgi.request(new Request(`http://localhost${pathname}?value=1`));
			const {env} = runtimes.at(-1);

			assert.equal(response.status, 200);
			assert.equal(env.get('SCRIPT_NAME'), `${prefix}/app.phar`);
			assert.equal(env.get('SCRIPT_FILENAME'), '/www/app.phar');
			assert.equal(env.get('PATH_INFO'), pathInfo);
			assert.equal(env.get('REQUEST_URI'), `${pathname}?value=1`);
			assert.equal(env.get('QUERY_STRING'), 'value=1');
		}

		await cgi.request(new Request(`http://localhost${prefix}/index.php`));
		assert.equal(runtimes.at(-1).env.get('PATH_INFO'), '');
		assert.equal(runtimes.at(-1).env.get('SCRIPT_NAME'), `${prefix}/index.php`);
	}
});

test('CGI honors root and virtual-host Phar entrypoints without replacing static files', async () => {
	for(const vHosts of [[], [{pathPrefix: '/cgi-bin/site', directory: '/www', entrypoint: 'app.phar'}]])
	{
		const {cgi, runtimes} = await createCgi({options: {
			docroot: '/www'
			, entrypoint: 'app.phar'
			, vHosts
		}});
		const prefix = vHosts.length ? '/cgi-bin/site' : '/cgi-bin';

		for(const pathInfo of ['/hello.txt', '/nested/asset.css', '/nested/index.php'])
		{
			const response = await cgi.request(new Request(`http://localhost${prefix}${pathInfo}`));
			const {env} = runtimes.at(-1);

			assert.equal(response.status, 200);
			assert.equal(env.get('SCRIPT_NAME'), `${prefix}/app.phar`);
			assert.equal(env.get('SCRIPT_FILENAME'), '/www/app.phar');
			assert.equal(env.get('PATH_INFO'), pathInfo);
		}

		const beforeStatic = runtimes.at(-1).requests;
		const response = await cgi.request(new Request(`http://localhost${prefix}/assets.css`));
		assert.equal(response.status, 200);
		assert.equal(runtimes.at(-1).requests, beforeStatic);
	}
});

test('CGI uses the configured PHP entrypoint for fallback routes', async () => {
	const {cgi, runtimes} = await createCgi({options: {
		docroot: '/www'
		, entrypoint: 'wp-admin/index.php'
		, vHosts: []
	}});
	await cgi.request(new Request('http://localhost/cgi-bin/missing-page'));
	assert.equal(runtimes.at(-1).env.get('SCRIPT_FILENAME'), '/www/wp-admin/index.php');
	assert.equal(runtimes.at(-1).env.get('SCRIPT_NAME'), '/cgi-bin/wp-admin/index.php');
});

test('CGI preserves string and explicit-script rewrites for Phar requests', async () => {
	for(const rewrite of [
		() => '/cgi-bin/app.phar/hello.txt'
		, () => ({path: '/app.phar/hello.txt', scriptName: '/cgi-bin/public.phar'})
	]){
		const {cgi, runtimes} = await createCgi({options: {docroot: '/www', vHosts: [], rewrite}});
		await cgi.request(new Request('http://localhost/cgi-bin/alias?value=1'));
		const {env} = runtimes.at(-1);
		const rewritten = rewrite();

		assert.equal(env.get('SCRIPT_FILENAME'), '/www/app.phar');
		assert.equal(env.get('SCRIPT_NAME'), typeof rewritten === 'string' ? '/cgi-bin/app.phar' : rewritten.scriptName);
		assert.equal(env.get('PATH_INFO'), '/hello.txt');
		assert.equal(env.get('REQUEST_URI'), '/cgi-bin/alias?value=1');
	}
});

test('CGI only treats existing Phar files as archives', async () => {
	const {cgi, runtimes} = await createCgi({options: {
		docroot: '/www'
		, vHosts: []
		, notFound: () => new Response('Not found', {status: 404})
	}});
	const missing = await cgi.request(new Request('http://localhost/cgi-bin/missing.phar/index.php'));
	assert.equal(missing.status, 404);
	assert.equal(runtimes.at(-1).requests, 0);

	await cgi.request(new Request('http://localhost/cgi-bin/folder.phar/index.php'));
	assert.equal(runtimes.at(-1).env.get('SCRIPT_FILENAME'), '/www/folder.phar/index.php');
	assert.equal(runtimes.at(-1).env.get('PATH_INFO'), '');
});

test('CGI runtime failures return a non-cacheable 500 and refresh exactly once', async () => {
	const {cgi} = await createCgi({failures: 1});
	const refresh = cgi.refresh.bind(cgi);
	const originalError = console.error;
	const originalWarn = console.warn;
	let refreshCount = 0;
	let requestCount = 0;

	cgi.refresh = () => {
		++refreshCount;
		return refresh();
	};
	cgi.onRequest = () => ++requestCount;
	console.error = () => undefined;
	console.warn = () => undefined;

	try
	{
		const response = await cgi.request(new Request('http://localhost/cgi-bin/site'));

		assert.equal(response.status, 500);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
		assert.match(await response.text(), /Aborted\(invalid state: 1\)/);
		assert.equal(refreshCount, 1);
		assert.equal(requestCount, 1);
		await cgi.binary;
	}
	finally
	{
		console.error = originalError;
		console.warn = originalWarn;
	}
});

test('CGI control messages extend worker lifetime and reply with runtime initialization errors', async () => {
	const cgi = Object.create(PhpCgiBase.prototype);
	const messages = [];
	const originalWarn = console.warn;
	let lifetimeWork;

	cgi.binary = Promise.reject(new Error('Wasm runtime failed to initialize'));
	cgi.extraActions = {};
	console.warn = () => undefined;

	try
	{
		const work = cgi.handleMessageEvent({
			data: {
				action: 'analyzePath'
				, token: 'startup-failure'
				, params: ['/persist/site']
			}
			, source: {postMessage: message => messages.push(message)}
			, waitUntil: pending => lifetimeWork = pending
		});

		assert.equal(lifetimeWork, work);
		await work;
	}
	finally
	{
		console.warn = originalWarn;
	}

	assert.equal(messages.length, 1);
	assert.equal(messages[0].re, 'startup-failure');
	assert.equal(messages[0].result, undefined);
	assert.equal(messages[0].error.name, 'Error');
	assert.equal(messages[0].error.message, 'Wasm runtime failed to initialize');
	assert.match(messages[0].error.stack, /Wasm runtime failed to initialize/);
});

test('a rejected async request returns 500 and queued requests use the replacement runtime', {timeout: 2000}, () => withQuietConsole(async () => {
	const previousLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
	let pending = Promise.resolve();
	const locks = {
		request: (name, callback) => {
			assert.equal(name, 'php-wasm-request-lock');
			const result = pending.then(callback);
			pending = result.catch(() => undefined);
			return result;
		}
	};
	Object.defineProperty(navigator, 'locks', {configurable: true, value: locks});
	try
	{
		const {cgi, runtimes} = await createCgi({failures: 1, rejectMain: true});
		const statuses = [];
		cgi.onRequest = (request, response) => statuses.push(response.status);
		const [failed, recovered] = await Promise.all([
			cgi.request(new Request('http://localhost/cgi-bin/site'))
			, cgi.request(new Request('http://localhost/cgi-bin/site'))
		]);

		assert.equal(failed.status, 500);
		assert.equal(failed.headers.get('cache-control'), 'no-store');
		assert.match(await failed.text(), /Aborted\(invalid state: 1\)/);
		assert.equal(recovered.status, 200);
		assert.equal(await recovered.text(), 'OK');
		assert.deepEqual(statuses, [500, 200]);
		assert.deepEqual(runtimes.map(runtime => runtime.requests), [1, 1]);
	}
	finally
	{
		if(previousLocks) Object.defineProperty(navigator, 'locks', previousLocks);
		else delete navigator.locks;
	}
}));

for(const failure of [null, 'native import rejected'])
{
	test(`CGI handles non-Error rejection: ${failure}`, () => withQuietConsole(async () => {
		const {cgi} = await createCgi({failures: 1, rejectMain: true, failure});
		const response = await cgi.request(new Request('http://localhost/cgi-bin/site'));
		assert.equal(response.status, 500);
		assert.ok((await response.text()).includes(`Stacktrace:\n${failure}\n`));
		await cgi.binary;
	}));
}

test('a failed background refresh is handled and subsequent requests return 500', () => withQuietConsole(async () => {
	const {cgi} = await createCgi({failures: 1, rejectMain: true});
	cgi.refresh = () => cgi.binary = Promise.reject(new Error('replacement runtime failed to initialize'));
	const first = await cgi.request(new Request('http://localhost/cgi-bin/site'));
	assert.equal(first.status, 500);
	// Allow an unhandled refresh rejection to surface before the next request.
	await new Promise(resolve => setImmediate(resolve));
	const next = await cgi.request(new Request('http://localhost/cgi-bin/site'));
	assert.equal(next.status, 500);
	assert.equal(next.headers.get('cache-control'), 'no-store');
	assert.match(await next.text(), /replacement runtime failed to initialize/);
}));
