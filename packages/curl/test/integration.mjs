import fs from 'node:fs/promises';
import http from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PhpNode} from '../../../test/lib/PhpNode.mjs';
import {curlFixture} from '../../../test/lib/curl-server.mjs';
import curl from '../index.mjs';
import {PhpCgiNode} from 'php-cgi-wasm/PhpCgiNode';
import {nodeRuntimeOptions} from '../../../test/lib/node-runtime-options.mjs';

const server = http.createServer((request, response) => {
	if(!curlFixture(request, response)) { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
server.unref();
const base = `http://127.0.0.1:${server.address().port}/php-wasm/curl`;
const fixtures = new URL('../../../test/fixtures/curl/', import.meta.url);

async function run(file, vendor = false)
{
	const php = new PhpNode({sharedLibs: process.env.WITH_CURL === 'static' ? [] : [curl]});
	let stdout = '', stderr = '';
	php.addEventListener('output', event => stdout += event.detail.join(''));
	php.addEventListener('error', event => stderr += event.detail.join(''));
	const binary = await php.binary;
	async function copy(source, target)
	{
		binary.FS.mkdirTree(target);
		for(const entry of await fs.readdir(source, {withFileTypes: true}))
		{
			if(entry.isDirectory()) await copy(new URL(`${entry.name}/`, source), `${target}/${entry.name}`);
			else binary.FS.writeFile(`${target}/${entry.name}`, await fs.readFile(new URL(entry.name, source)));
		}
	}
	if(vendor) await copy(new URL('vendor/', fixtures), '/guzzle-vendor');
	const source = await fs.readFile(new URL(file, fixtures), 'utf8');
	const status = await php.run(`<?php $base = ${JSON.stringify(base)}; ?>${source}`);
	assert.equal(stderr, '');
	assert.equal(status, 0);
	assert.equal(binary.libcurlFetch.requests.size, 0);
	return JSON.parse(stdout);
}

test('the packaged extension streams downloads, aborts callbacks, and times out during bodies', async () => {
	assert.deepEqual(await run('streaming.php'), [true, true, true]);
});

test('Guzzle loads the packaged extension for uploads, Digest, progress, and independently completing Pool requests', async () => {
	assert.deepEqual(await run('guzzle.php', true), [true, true, true, [1, 2, 3, 0]]);
});

test('CGI loads curl and keeps its Fetch options across requests and refreshes', async () => {
	const cgi = new PhpCgiNode(nodeRuntimeOptions({
		runtime: 'cgi'
		, version: process.env.PHP_VERSION ?? '8.4'
		, docroot: '/preload'
		, prefix: '/cgi/'
		, persist: []
		, sharedLibs: process.env.WITH_CURL === 'static' ? [] : [curl]
		, libcurlFetchOptions: {credentials: 'omit'}
	}));
	for(let attempt = 0; attempt < 2; ++attempt)
	{
		const binary = await cgi.binary;
		assert.equal(binary.libcurlFetchOptions.credentials, 'omit');
		binary.FS.mkdirTree('/config');
		binary.FS.mkdirTree('/persist');
		binary.FS.writeFile('/preload/curl.php', `<?php
			$ch = curl_init(${JSON.stringify(base + '/gzip')});
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
			echo curl_exec($ch);
		`);
		const response = await cgi.request({url: '/cgi/curl.php', method: 'GET', headers: {host: 'localhost'}});
		assert.equal(response.status, 200);
		assert.equal(await response.text(), 'decoded curl body');
		if(attempt === 0) await cgi.refresh();
	}
});
