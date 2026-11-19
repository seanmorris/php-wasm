import {loadEmbeddedSharedLibs, loadCgiSharedLibs} from './runtime-libs.mjs';

const constructors = {
	PhpWorker: () => import('/packages/php-wasm/PhpWorker.mjs')
	, PhpWebview: () => import('/packages/php-wasm/PhpWebview.mjs')
	, PhpCgiWeb: () => import('/packages/php-cgi-wasm/PhpCgiWeb.mjs')
	, PhpCgiWebview: () => import('/packages/php-cgi-wasm/PhpCgiWebview.mjs')
};

/**
 * Boots a public wrapper and runs PHP through its native loader.
 * @param {object} options Runtime selection.
 * @param {string} options.entrypoint Public class name.
 * @param {string} options.version PHP minor version.
 * @param {string} options.libType Native library profile.
 * @returns {Promise<object>} Exit or HTTP status and PHP output.
 */
export async function runEntrypoint({entrypoint, version, libType})
{
	const {[entrypoint]: Runtime} = await constructors[entrypoint]();
	const cgi = entrypoint.startsWith('PhpCgi');
	const runtime = new Runtime({
		version
		, persist: false
		, files: [{parent: '/preload', name: 'entrypoint.php', url: new URL('../fixtures/scripts/hello-world.php', import.meta.url)}]
		, sharedLibs: cgi ? loadCgiSharedLibs(libType, version) : loadEmbeddedSharedLibs(libType, '', version)
		, ...(cgi ? {docroot: '/preload', prefix: '/runtime-entrypoint/', staticFS: true} : {})
	});
	const code = 'echo json_encode(["version" => PHP_VERSION, "sapi" => PHP_SAPI, "bridge" => extension_loaded("vrzno"), "preloaded" => is_file("/preload/entrypoint.php")]);';
	if(cgi)
	{
		await runtime.mkdir('/config');
		await runtime.writeFile('/preload/index.php', `<?php ${code}`);
		const response = await runtime.request(new Request(new URL('/runtime-entrypoint/index.php', globalThis.location.href)));
		return {status: response.status, result: await response.json()};
	}
	let stdout = '', stderr = '';
	runtime.addEventListener('output', event => stdout += event.detail.join(''));
	runtime.addEventListener('error', event => stderr += event.detail.join(''));
	const status = await runtime.run(`<?php ${code}`);
	return {status, stderr, result: JSON.parse(stdout)};
}
