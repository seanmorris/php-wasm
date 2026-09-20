import assert from 'node:assert/strict';
import test, {beforeEach, afterEach} from 'node:test';
import {PhpCgiWebBase} from '../source/PhpCgiWebBase.mjs';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
beforeEach(() => {
	const pending = new Map();
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true
		, value: {locks: {
			request: (name, callback) => {
				const result = (pending.get(name) ?? Promise.resolve()).then(callback);
				pending.set(name, result.catch(() => undefined));
				return result;
			}
		}}
	});
});
afterEach(() => {
	if(originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
	else delete globalThis.navigator;
});

const deferred = () => {
	let resolve;
	const promise = new Promise(accept => resolve = accept);
	return {promise, resolve};
};

const createCgi = async main => {
	let persisted = new Map([
		['/preload', null], ['/www', null], ['/www/index.php', '<?php']
	]);
	const runtimes = [];
	const loader = Promise.resolve({default: args => {
		const files = new Map(persisted);
		const runtime = {
			files, persist: true
			, FS: {
				analyzePath: path => files.has(path)
					? {exists: true, object: {mode: files.get(path) === null ? 'directory' : 'file'}}
					: {exists: false}
				, mkdir: path => files.set(path, null)
				, isFile: mode => mode === 'file'
				, isDir: mode => mode === 'directory'
				, readFile: path => files.get(path)
				, writeFile: (path, data) => files.set(path, data)
				, syncfs: (populate, callback) => {
					if(!populate && runtime.commitError)
					{
						const error = runtime.commitError;
						runtime.commitError = null;
						queueMicrotask(() => callback(error));
						return;
					}
					if(populate)
					{
						files.clear();
						for(const [path, data] of persisted) files.set(path, data);
					}
					else persisted = new Map(files);
					queueMicrotask(() => callback());
				}
			}
			, ccall: async name => {
				if(name !== 'wasm_sapi_cgi_main') return 0;
				const output = await main(runtime);
				for(const byte of new TextEncoder().encode(`Content-Type: text/plain\r\n\r\n${output}`)) args.stdout(byte);
				return 0;
			}
		};
		runtimes.push(runtime);
		return runtime;
	}});
	const cgi = new PhpCgiWebBase(loader, {version: '8.3', docroot: '/www', prefix: '/cgi/'});
	await cgi.binary;
	return {cgi, runtimes};
};

test('CGI execution keeps uncommitted files safe from concurrent filesystem RPC hydration', {timeout: 3000}, async () => {
	const started = deferred();
	const resume = deferred();
	const {cgi, runtimes} = await createCgi(async runtime => {
		runtime.files.set('/www/from-php.txt', 'kept');
		started.resolve();
		await resume.promise;
		return runtime.files.get('/www/from-php.txt') ?? 'lost';
	});
	const response = cgi.request(new Request('http://localhost/cgi/index.php'));
	await started.promise;
	let acknowledged = false;
	const writing = cgi.writeFile('/www/from-rpc.txt', 'rpc').then(() => acknowledged = true);
	await new Promise(resolve => setImmediate(resolve));
	const acknowledgedDuringPhp = acknowledged;
	resume.resolve();
	const [result] = await Promise.all([response, writing]);
	assert.equal(acknowledgedDuringPhp, false, 'RPC acknowledgment must wait for PHP and its commit');
	assert.equal(result.status, 200);
	assert.equal(await result.text(), 'kept');
	await cgi.refresh();
	assert.equal(runtimes.at(-1).files.get('/www/from-php.txt'), 'kept');
	assert.equal(runtimes.at(-1).files.get('/www/from-rpc.txt'), 'rpc');
});

test('refresh queued during a request does not deadlock its commit or reuse a stale runtime', {timeout: 3000}, async () => {
	const started = deferred();
	const resume = deferred();
	let calls = 0;
	const {cgi, runtimes} = await createCgi(async runtime => {
		if(++calls === 1)
		{
			runtime.files.set('/www/committed.txt', 'first');
			started.resolve();
			await resume.promise;
		}
		return String(runtimes.indexOf(runtime));
	});
	const first = cgi.request(new Request('http://localhost/cgi/index.php'));
	await started.promise;
	const second = cgi.request(new Request('http://localhost/cgi/index.php'));
	const refreshing = cgi.refresh();
	resume.resolve();
	const [one, two] = await Promise.all([first, second, refreshing]);
	assert.equal(await one.text(), '0');
	assert.equal(await two.text(), '1');
	assert.equal(runtimes[1].files.get('/www/committed.txt'), 'first');
});

test('CGI and filesystem operations serialize without the Web Locks API', {timeout: 3000}, async () => {
	Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
	const started = deferred();
	const resume = deferred();
	const {cgi} = await createCgi(async runtime => {
		runtime.files.set('/www/from-php.txt', 'kept');
		started.resolve();
		await resume.promise;
		return runtime.files.get('/www/from-php.txt') ?? 'lost';
	});
	const response = cgi.request(new Request('http://localhost/cgi/index.php'));
	await started.promise;
	const writing = cgi.writeFile('/www/from-rpc.txt', 'rpc');
	await new Promise(resolve => setImmediate(resolve));
	resume.resolve();
	const [result] = await Promise.all([response, writing]);
	assert.equal(await result.text(), 'kept');
	await cgi.refresh();
	assert.equal(await cgi.readFile('/www/from-php.txt'), 'kept');
	assert.equal(await cgi.readFile('/www/from-rpc.txt'), 'rpc');
});

test('a failed request commit reports one error and releases the lock for later work', {timeout: 3000}, async t => {
	const originalError = console.error;
	console.error = () => undefined;
	t.after(() => console.error = originalError);
	const {cgi, runtimes} = await createCgi(async () => 'ready');
	const reported = [];
	cgi.onRequest = (request, response) => reported.push(response.status);
	runtimes[0].commitError = new Error('storage unavailable');
	const failed = await cgi.request(new Request('http://localhost/cgi/index.php'));
	assert.equal(failed.status, 500);
	assert.equal(failed.headers.get('Cache-Control'), 'no-store');
	assert.match(await failed.text(), /storage unavailable/);
	assert.deepEqual(reported, [500]);
	await cgi.writeFile('/www/later.txt', 'saved');
	const recovered = await cgi.request(new Request('http://localhost/cgi/index.php'));
	assert.equal(recovered.status, 200);
	assert.deepEqual(reported, [500, 200]);
	await cgi.refresh();
	assert.equal(await cgi.readFile('/www/later.txt'), 'saved');
});
