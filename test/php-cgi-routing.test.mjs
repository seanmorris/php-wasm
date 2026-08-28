import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PhpCgiBase } from '../source/PhpCgiBase.mjs';

const responseBytes = new TextEncoder().encode('Content-Type: text/plain\r\n\r\nOK');

const createCgi = async ({failMain = false} = {}) => {
	const runtimes = [];
	const paths = new Map([
		['/preload', {isFolder: true, mode: 'directory'}]
		, ['/www', {isFolder: true, mode: 'directory'}]
		, ['/www/index.php', {isFolder: false, mode: 'file'}]
		, ['/www/wp-admin', {isFolder: true, mode: 'directory'}]
		, ['/www/wp-admin/index.php', {isFolder: false, mode: 'file'}]
	]);

	const loader = Promise.resolve({
		default: args => {
			const env = new Map;
			const runtime = {
				env
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
						if(failMain)
						{
							throw new Error('Aborted(invalid state: 1)');
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
	});

	await cgi.binary;

	return {cgi, runtimes};
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

test('CGI runtime failures return a non-cacheable 500 and refresh exactly once', async () => {
	const {cgi} = await createCgi({failMain: true});
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
