import fs from 'node:fs/promises';
import {test, expect} from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const variant = process.env.PHP_VARIANT ?? '';
const libType = process.env.LIB_TYPE ?? 'dynamic';
const curlMode = process.env.WITH_CURL ?? (libType === 'static' ? 'static' : 'dynamic');

test.skip(curlMode === '0' || variant === '_sdl', 'curl is disabled in this runtime');

test('curl requests go through fetch and obey the browser origin rules', async ({page}) => {
	await page.goto('harness/index.html');
	const result = await page.evaluate(async ({version, curlMode, libType}) => {
		const {createEmbeddedRuntime} = await import('/php-wasm/harness/embedded-runtime.mjs');
		const {loadEmbeddedSharedLibs} = await import('/php-wasm/harness/runtime-libs.mjs');
		const curl = await import('/packages/curl/index.mjs');
		const php = await createEmbeddedRuntime(version, '', {sharedLibs: [...loadEmbeddedSharedLibs(libType), ...(curlMode === 'static' ? [] : [curl])]});
		let stdout = '', stderr = '';
		php.addEventListener('output', event => stdout += event.detail.join(''));
		php.addEventListener('error', event => stderr += event.detail.join(''));
		const sameOrigin = new URL('/php-wasm/curl-echo', location.href).href;
		const crossOrigin = sameOrigin.replace('127.0.0.1', 'localhost');
		const status = await php.run(`<?php
			$ch = curl_init(${JSON.stringify(sameOrigin)});
			curl_setopt_array($ch, [
				CURLOPT_RETURNTRANSFER => true,
				CURLOPT_HEADER => true,
				CURLOPT_POSTFIELDS => 'hello=browser',
				CURLOPT_HTTPHEADER => ['X-Custom: one'],
			]);
			$response = curl_exec($ch);
			$size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
			$echo = json_decode(substr($response, $size), true);
			$cross = curl_init(${JSON.stringify(crossOrigin)});
			curl_setopt($cross, CURLOPT_RETURNTRANSFER, true);
			echo json_encode([
				'code' => curl_getinfo($ch, CURLINFO_HTTP_CODE),
				'echoHeader' => str_contains(substr($response, 0, $size), "x-echo: yes"),
				'method' => $echo['method'],
				'body' => $echo['body'],
				'custom' => $echo['headers']['x-custom'],
				'cross' => [curl_exec($cross), curl_errno($cross)],
			]);
		`);
		return {status, stdout, stderr};
	}, {version, curlMode, libType});

	expect(result.stderr).toBe('');
	expect(result.status).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual({
		code: 200
		, echoHeader: true
		, method: 'POST'
		, body: 'hello=browser'
		, custom: 'one'
		, cross: [false, 7]
	});
});

/**
 * Runs a fixture through the public package loader and reports native cleanup.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {string} source PHP fixture source.
 * @param {object} options Fixture options.
 * @param {string} options.credentials Fetch credential policy.
 * @param {boolean} options.vendor Whether to preload Composer dependencies.
 * @returns {Promise<object>} Runtime output and outstanding request count.
 */
async function run(page, source, {credentials = 'same-origin', vendor = false} = {})
{
	const files = [];
	/**
	 * Collects Composer files for the virtual filesystem.
	 * @param {string} directory Local directory.
	 * @param {string} target Virtual directory.
	 * @returns {Promise<void>} Resolves after collecting the files.
	 */
	async function collect(directory, target)
	{
		for(const entry of await fs.readdir(directory, {withFileTypes: true}))
		{
			if(entry.isDirectory()) await collect(`${directory}/${entry.name}`, `${target}/${entry.name}`);
			else files.push([`${target}/${entry.name}`, await fs.readFile(`${directory}/${entry.name}`, 'utf8')]);
		}
	}
	if(vendor) await collect('test/fixtures/curl/vendor', '/guzzle-vendor');
	await page.goto('harness/index.html');
	return page.evaluate(async ({version, curlMode, libType, source, credentials, files}) => {
		const {createEmbeddedRuntime} = await import('/php-wasm/harness/embedded-runtime.mjs');
		const {loadEmbeddedSharedLibs} = await import('/php-wasm/harness/runtime-libs.mjs');
		const curl = await import('/packages/curl/index.mjs');
		const php = await createEmbeddedRuntime(version, '', {sharedLibs: [...loadEmbeddedSharedLibs(libType), ...(curlMode === 'static' ? [] : [curl])], libcurlFetchOptions: {credentials}});
		let stdout = '', stderr = '';
		php.addEventListener('output', event => stdout += event.detail.join(''));
		php.addEventListener('error', event => stderr += event.detail.join(''));
		const binary = await php.binary;
		for(const [name, content] of files)
		{
			binary.FS.mkdirTree(name.slice(0, name.lastIndexOf('/')));
			binary.FS.writeFile(name, content);
		}
		const base = new URL('/php-wasm/curl', location.href).href;
		const status = await php.run(`<?php $base = ${JSON.stringify(base)}; ?>${source}`);
		return {status, stdout, stderr, requests: binary.libcurlFetch?.requests.size};
	}, {version, curlMode, libType, source, credentials, files});
}

test('curl streams bodies and stops on progress cancellation and timeouts', async ({page}) => {
	const result = await run(page, await fs.readFile('test/fixtures/curl/streaming.php', 'utf8'));
	expect(result).toEqual({status: 0, stdout: '[true,true,true]', stderr: '', requests: 0});
});

test('curl sends allowed CORS preflights and reads decoded cross-origin bodies', async ({page}) => {
	const result = await run(page, `<?php
		$cross = str_replace('127.0.0.1', 'localhost', $base);
		$ch = curl_init("$cross/echo?cors=1");
		curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POSTFIELDS => 'cors-body', CURLOPT_HTTPHEADER => ['X-Custom: allowed']]);
		$data = json_decode(curl_exec($ch), true);
		$allowed = $data['headers']['x-custom'] === 'allowed' && $data['body'] === 'cors-body';
		curl_setopt_array($ch, [CURLOPT_URL => "$cross/gzip?cors=1", CURLOPT_HTTPGET => true]);
		echo json_encode([$allowed, curl_exec($ch), curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD)]);
	`, {credentials: 'include'});
	expect(result).toEqual({status: 0, stdout: '[true,"decoded curl body",17]', stderr: '', requests: 0});
});

test('Guzzle works through the packaged browser extension', async ({page}) => {
	// Keep HTTP authentication in PHP; credentialed Fetch can open a browser
	// login prompt before exposing the 401 challenge to JavaScript.
	const result = await run(page, await fs.readFile('test/fixtures/curl/guzzle.php', 'utf8'), {vendor: true, credentials: 'omit'});
	expect(result).toEqual({status: 0, stdout: '[true,true,true,[1,2,3,0]]', stderr: '', requests: 0});
});

for(const credentials of ['same-origin', 'omit', 'include'])
{
	test(`curl forwards the ${credentials} credential policy to Fetch`, async ({page, context}) => {
		await page.goto('harness/index.html');
		await context.addCookies([{name: 'curl_session', value: 'browser', url: new URL(page.url()).origin}]);
		const result = await run(page, `<?php
			$ch = curl_init("$base/echo");
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			$data = json_decode(curl_exec($ch), true);
			echo json_encode($data['headers']['cookie'] ?? '');
		`, {credentials});
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toBe(credentials === 'omit' ? '' : 'curl_session=browser');
	});
}

test('curl refuses hidden browser redirects unless following is explicitly requested', async ({page}) => {
	const result = await run(page, `<?php
		$ch = curl_init("$base/redirect");
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		// PHP does not expose libcurl's CURLE_NOT_BUILT_IN constant.
		$refused = curl_exec($ch) === false && curl_errno($ch) === 4;
		curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
		$followed = curl_exec($ch) !== false && curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200;
		curl_setopt($ch, CURLOPT_MAXREDIRS, 0);
		$limited = curl_exec($ch) === false && curl_errno($ch) === CURLE_TOO_MANY_REDIRECTS;
		echo json_encode([$refused, $followed, $limited]);
	`);
	expect(result).toEqual({status: 0, stdout: '[true,true,true]', stderr: '', requests: 0});
});

test('curl loads in a CGI worker and honors its browser credential policy', async ({page, context}) => {
	await page.goto('harness/index.html');
	await context.addCookies([{name: 'curl_session', value: 'browser', url: new URL(page.url()).origin}]);
	const result = await page.evaluate(args => new Promise((resolve, reject) => {
		const worker = new Worker('/php-wasm/harness/curl-worker.mjs', {type: 'module'});
		worker.onmessage = event => { worker.terminate(); resolve(event.data); };
		worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
		worker.postMessage(args);
	}), {version, libType, curlMode});
	expect(result).toEqual({status: 200, data: [true, 'GET', ''], requests: 0});
});
