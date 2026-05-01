import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import http from 'node:http';

import { PhpNode } from '../../../packages/php-wasm/PhpNode.mjs';
import { PhpCgiNode } from '../../../packages/php-cgi-wasm/PhpCgiNode.mjs';
import { phpWasmPackageDir } from './paths.mjs';

function ensureNavigatorLocks()
{
	if(!globalThis.navigator)
	{
		globalThis.navigator = {};
	}

	if(!globalThis.navigator.locks)
	{
		globalThis.navigator.locks = {
			async request(_name, callback)
			{
				return await callback();
			},
		};
	}
}

export function getAvailablePhpNodeVersion(options = {})
{
	const { minVersion = null } = typeof options === 'string'
		? { minVersion: options }
		: options;

	const versions = fs.readdirSync(phpWasmPackageDir)
		.map(entry => entry.match(/^php(\d+\.\d+)-node\.mjs$/))
		.filter(Boolean)
		.map(match => match[1])
		.filter(version => !minVersion || version.localeCompare(minVersion, undefined, { numeric: true }) >= 0)
		.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

	if(!versions.length)
	{
		const suffix = minVersion
			? ` >= ${minVersion}`
			: '';
		throw new Error(`No local PhpNode runtime build${suffix} is available.`);
	}

	return versions[0];
}

export function capturePhpIo(php)
{
	let stdout = '';
	let stderr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdout += line)));
	php.addEventListener('error',  event => event.detail.forEach(line => void (stderr += line)));

	return {
		get stdout(){ return stdout; },
		get stderr(){ return stderr; },
		reset()
		{
			stdout = '';
			stderr = '';
		},
	};
}

export async function createPhpNode(options = {})
{
	ensureNavigatorLocks();
	const version = options.version ?? getAvailablePhpNodeVersion();
	const php = new PhpNode({ version, ...options });

	await php.binary;

	return php;
}

export async function createPhpCgiNode(options = {})
{
	ensureNavigatorLocks();
	const version = options.version
		?? process.env.PHP_VERSION;

	if(!version)
	{
		throw new Error('No PhpCgiNode runtime version was specified. Set PHP_VERSION or pass options.version explicitly.');
	}

	const php = new PhpCgiNode({ version, ...options });

	await php.binary;

	return php;
}

export async function withTempDir(callback)
{
	const directory = await mkdtemp(path.join(os.tmpdir(), 'php-wasm-docs-'));

	try
	{
		return await callback(directory);
	}
	finally
	{
		await rm(directory, { recursive: true, force: true });
	}
}

export async function writeTree(root, tree)
{
	for(const [relativePath, contents] of Object.entries(tree))
	{
		const destination = path.join(root, relativePath);
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(destination, contents);
	}
}

export async function listen(server)
{
	return await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve(server.address());
		});
	});
}

export async function closeServer(server)
{
	return await new Promise((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
	});
}

export function createRequestServer(php)
{
	return http.createServer(async (request, response) => {
		const result = await php.request(request);
		const reader = result.body.getReader();

		response.writeHead(result.status, [...result.headers.entries()].flat());

		let done = false;

		while(!done)
		{
			const chunk = await reader.read();
			done = chunk.done;

			if(chunk.value)
			{
				response.write(chunk.value);
			}
		}

		response.end();
	});
}
