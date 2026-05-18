const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { mkdtemp, rm, writeFile, mkdir } = require('node:fs/promises');

const { PhpNode } = require('php-wasm/PhpNode');
const { PhpCgiNode } = require('php-cgi-wasm/PhpCgiNode');
const { phpWasmPackageDir } = require('./paths.cjs');
const { nodeRuntimeOptions } = require('../../lib/node-runtime-options.cjs');

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

function getAvailablePhpNodeVersion(options = {})
{
	const { minVersion = null } = typeof options === 'string'
		? { minVersion: options }
		: options;

	const versions = fs.readdirSync(phpWasmPackageDir)
		.map(entry => entry.match(/^php(\d+\.\d+)-node\.(?:mjs|js)$/))
		.filter(Boolean)
		.map(match => match[1])
		.filter((version, index, versions) => versions.indexOf(version) === index)
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

function capturePhpIo(php)
{
	let stdout = '';
	let stderr = '';

	php.addEventListener('output', event => event.detail.forEach(line => void (stdout += line)));
	php.addEventListener('error', event => event.detail.forEach(line => void (stderr += line)));

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

async function createPhpNode(options = {})
{
	ensureNavigatorLocks();
	const version = options.version ?? getAvailablePhpNodeVersion();
	const php = new PhpNode(nodeRuntimeOptions({ version, runtime: 'php', ...options }));

	await php.binary;

	return php;
}

async function createPhpCgiNode(options = {})
{
	ensureNavigatorLocks();
	const version = options.version ?? process.env.PHP_VERSION;

	if(!version)
	{
		throw new Error('No PhpCgiNode runtime version was specified. Set PHP_VERSION or pass options.version explicitly.');
	}

	const php = new PhpCgiNode(nodeRuntimeOptions({ version, runtime: 'cgi', ...options }));

	await php.binary;

	return php;
}

async function withTempDir(callback)
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

async function writeTree(root, tree)
{
	for(const [relativePath, contents] of Object.entries(tree))
	{
		const destination = path.join(root, relativePath);
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(destination, contents);
	}
}

async function listen(server)
{
	return await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve(server.address());
		});
	});
}

async function closeServer(server)
{
	return await new Promise((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
	});
}

function createRequestServer(php)
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

module.exports = {
	capturePhpIo,
	closeServer,
	createPhpCgiNode,
	createPhpNode,
	createRequestServer,
	getAvailablePhpNodeVersion,
	listen,
	withTempDir,
	writeTree,
};
