import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {PhpCgiNode} from 'php-cgi-wasm/PhpCgiNode';
import {nodeRuntimeOptions} from './lib/node-runtime-options.mjs';

test('CGI serves Phar applications, assets and entrypoints across requests', {skip: process.env.WITH_PHAR === '0'}, async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'php-cgi-phar-'));

	try
	{
		const config = path.join(directory, 'config');
		await mkdir(config);
		await copyFile(new URL('../packages/phar/test/fixtures/webapp.phar', import.meta.url), path.join(directory, 'webapp.phar'));
		await writeFile(path.join(directory, 'ordinary.php'), '<?php echo json_encode([$_SERVER["SCRIPT_NAME"], $_SERVER["PATH_INFO"] ?? ""]);');
		const php = new PhpCgiNode(nodeRuntimeOptions({
			runtime: 'cgi'
			, version: process.env.PHP_VERSION ?? '8.4'
			, prefix: '/cgi-bin/'
			, docroot: '/persist'
			, entrypoint: 'webapp.phar'
			, persist: [
				{mountPath: '/persist', localPath: directory}
				, {mountPath: '/config', localPath: config}
			]
		}));
		const request = url => php.request({url, method: 'GET', headers: {host: 'localhost'}});

		for(const prefix of ['/cgi-bin', '/cgi-bin/site'])
		{
			if(prefix.endsWith('/site'))
			{
				php.vHosts = [{pathPrefix: prefix, directory: '/persist', entrypoint: 'webapp.phar'}];
			}

			for(const pathname of [`${prefix}/webapp.phar`, `${prefix}/`])
			{
				const response = await request(pathname);
				assert.equal(response.status, 301);
				assert.equal(response.headers.get('location'), `${prefix}/webapp.phar/index.php`);
			}

			const index = await request(`${prefix}/webapp.phar/index.php?value=1`);
			assert.equal(index.status, 200);
			assert.deepEqual(await index.json(), {path: '/index.php', query: {value: '1'}});
			const fallbackIndex = await request(`${prefix}/index.php?value=2`);
			assert.equal(fallbackIndex.status, 200);
			assert.deepEqual(await fallbackIndex.json(), {path: '/index.php', query: {value: '2'}});

			for(const pathname of [`${prefix}/webapp.phar/hello.txt`, `${prefix}/hello.txt`])
			{
				const asset = await request(pathname);
				assert.equal(asset.status, 200);
				assert.equal(await asset.text(), 'web asset\n');
			}

			const binary = await request(`${prefix}/webapp.phar/binary.bin`);
			assert.equal(binary.status, 200);
			assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), new Uint8Array([0, 255, 65, 13, 10]));
			const missing = await request(`${prefix}/webapp.phar/missing.txt`);
			assert.equal(missing.status, 404);

			const ordinary = await request(`${prefix}/ordinary.php`);
			assert.equal(ordinary.status, 200);
			assert.deepEqual(await ordinary.json(), [`${prefix}/ordinary.php`, '']);
		}
	}
	finally
	{
		await rm(directory, {recursive: true, force: true});
	}
});
