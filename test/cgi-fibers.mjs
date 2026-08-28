import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PhpCgiNode } from 'php-cgi-wasm/PhpCgiNode';
import { nodeRuntimeOptions } from './lib/node-runtime-options.mjs';

const phpVersion = process.env.PHP_VERSION ?? '8.4';
const fixtureRoot = fileURLToPath(new URL('./fixtures/', import.meta.url));

test(`CGI preserves compiler and Zend Fiber Asyncify state (${phpVersion})`, async () => {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'php-cgi-fibers-'));
	const configRoot = path.join(tempRoot, 'config');
	await mkdir(configRoot);
	const php = new PhpCgiNode(nodeRuntimeOptions({
		version: phpVersion
		, runtime: 'cgi'
		, prefix: '/'
		, docroot: '/persist'
		, persist: [
			{ mountPath: '/persist', localPath: fixtureRoot }
			, { mountPath: '/config', localPath: configRoot }
		]
	}));

	try
	{
		await php.binary;

		const cases = [
			['asyncify-compiler.php', `asyncify-compiler-ok:${phpVersion}\n`]
			, ['fibers.php'
			, phpVersion === '8.0'
				? 'fiber-unavailable:8.0\n'
				: `fibers-ok:${phpVersion}\n`]
			, ['fibers.php'
			, phpVersion === '8.0'
				? 'fiber-unavailable:8.0\n'
				: `fibers-ok:${phpVersion}\n`]
		];

		for(const [fixture, expected] of cases)
		{
			const response = await php.request({
				url: `/${fixture}`
				, method: 'GET'
				, headers: {host: 'localhost'}
			});

			assert.equal(response.status, 200, `${fixture} returned HTTP ${response.status}`);
			assert.equal(await response.text(), expected);
		}
	}
	finally
	{
		await rm(tempRoot, { recursive: true, force: true });
	}
});
