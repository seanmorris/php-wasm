import { PhpDbgWeb } from '/packages/php-dbg-wasm/PhpDbgWeb.mjs';

import {
	appendStderr,
	appendStdout,
	buildType,
	createIni,
	preloadFiles,
	query,
	runtimeVersion,
	setMeta,
	setStatus,
} from './common.mjs';
import { loadDbgSharedLibs } from './runtime-libs.mjs';

const startPath = query.get('path') ?? '/preload/test_www/hello-world.php';

const main = async () => {
	setStatus('loading');

	const php = new PhpDbgWeb({
		files: preloadFiles
		, ini: createIni()
		, persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
		, sharedLibs: loadDbgSharedLibs(buildType)
		, version: runtimeVersion
	});

	let bootstrapped = false;

	php.addEventListener('output', event => appendStdout(event.detail));
	php.addEventListener('error', event => appendStderr(event.detail));
	php.addEventListener('stdin-request', async () => {
		setMeta('prompt', await php.getPrompt());
		setMeta('current-file', await php.currentFile());
		setMeta('current-line', await php.currentLine());

		if(bootstrapped)
		{
			setStatus('ready');
			return;
		}

		bootstrapped = true;

		await php.provideInput(`exec ${startPath}`);
		await php.provideInput('set pagination off');
	});

	await php.run();
};

main().catch(error => {
	appendStderr([`${String(error)}\n`]);
	setStatus('failed');
	throw error;
});
