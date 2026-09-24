import {PhpCgiWebBase} from '/packages/php-cgi-wasm/PhpCgiWebBase.mjs';
import {resolveDependencies} from '/packages/php-cgi-wasm/resolveDependencies.mjs';
import {loadCgiSharedLibs} from './runtime-libs.mjs';

const query = new URL(location.href).searchParams;
const version = query.get('version') ?? '8.4';
const sharedLibs = loadCgiSharedLibs(query.get('libType') ?? 'dynamic');
const module = import(`/packages/php-cgi-wasm/php${version}-cgi-worker.mjs`);
const runtimes = [];

/**
 * Creates an independent CGI runtime sharing this origin's persisted mounts.
 * @returns {Promise<object>} Wrapper and its native filesystem.
 */
async function create()
{
	const cgi = new PhpCgiWebBase(module, {version, sharedLibs, docroot: '/preload', prefix: '/cgi/', staticCacheTime: -1});
	const php = await cgi.binary;
	const runtime = {cgi, php, FS: php.FS};
	runtimes.push(runtime);
	return runtime;
}

/**
 * Hydrates storage through the unmodified native IDBFS implementation.
 * @returns {Promise<object>} Independent filesystem without the optimizer.
 */
async function createLegacy()
{
	const {default: factory} = await module;
	const {urlLibs} = resolveDependencies(sharedLibs, {phpVersion: version});
	const php = await factory({
		persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
		, locateFile: (path, directory) => urlLibs[path] ?? directory + path
	});
	await php.ccall('pib_storage_init', 'number', [], [], {async: true});
	await sync(php.FS, true);
	return {php, FS: php.FS};
}

/**
 * Waits for the actual filesystem synchronization callback.
 * @param {object} FS Runtime filesystem.
 * @param {boolean} [populate] Read persistent storage instead of flushing.
 * @returns {Promise<void>} Database transaction completion.
 */
const sync = (FS, populate = false) => new Promise((resolve, reject) => FS.syncfs(populate, error => error ? reject(error) : resolve()));

self.onmessage = async event => {
	try
	{
		if(!runtimes.length) await create();
		// Test programs run only in this dedicated browser-harness worker.
		const program = Function(`return (${event.data.program});`)();
		const result = await program({runtimes, create, createLegacy, sync});
		self.postMessage({id: event.data.id, result});
	}
	catch(error)
	{ self.postMessage({id: event.data.id, error: {name: error?.name, errno: error?.errno, message: error?.message ?? String(error), stack: error?.stack}}); }
};
