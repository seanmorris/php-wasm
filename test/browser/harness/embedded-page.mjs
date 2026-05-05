import { PGlite } from '/node_modules/@electric-sql/pglite/dist/index.js';
import { PhpWeb } from '/packages/php-wasm/PhpWeb.mjs';

import {
	appendStderr,
	appendStdout,
	buildType,
	createIni,
	demo,
	extensionFlags,
	loadFixtureScript,
	preloadFiles,
	runtimeVersion,
	setMeta,
	setStatus,
	variant,
} from './common.mjs';
import {
	loadEmbeddedDynamicLibs,
	loadEmbeddedExtensionLibs,
	loadEmbeddedSharedLibs,
} from './runtime-libs.mjs';

const main = async () => {
	setStatus('loading');

	const php = new PhpWeb({
		version: runtimeVersion
		, ...(variant ? {variant} : {})
		, dynamicLibs: loadEmbeddedDynamicLibs(demo)
		, files: preloadFiles
		, ini: createIni()
		, PGlite
		, persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
		, sharedLibs: [
			...loadEmbeddedSharedLibs(buildType)
			, ...loadEmbeddedExtensionLibs(buildType, extensionFlags)
		]
	});

	php.addEventListener('output', event => appendStdout(event.detail));
	php.addEventListener('error', event => appendStderr(event.detail));

	const exitCode = await php.run(await loadFixtureScript(demo));

	setMeta('exit-code', exitCode);
	setStatus(exitCode === 0 ? 'done' : 'failed');

	if(exitCode !== 0)
	{
		throw new Error(`Embedded PHP exited with code ${exitCode}.`);
	}
};

main().catch(error => {
	appendStderr([`${String(error)}\n`]);
	setStatus('failed');
	throw error;
});
