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

const waitForPrompt = async php => {
	const start = Date.now();

	while(Date.now() - start < 30000)
	{
		const prompt = await php.getPrompt().catch(() => '');

		if(/prompt>/i.test(prompt))
		{
			return prompt;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	throw new Error('Timed out waiting for phpdbg prompt.');
};

const main = async () => {
	setStatus('loading');

	const php = new PhpDbgWeb({
		files: preloadFiles
		, ini: createIni()
		, persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
		, sharedLibs: loadDbgSharedLibs(buildType)
		, version: runtimeVersion
	});

	php.addEventListener('output', event => appendStdout(event.detail));
	php.addEventListener('error', event => appendStderr(event.detail));

	const updatePromptState = async () => {
		setMeta('prompt', await php.getPrompt());
		setMeta('current-file', await php.currentFile());
		setMeta('current-line', await php.currentLine());
	};

	php.addEventListener('stdin-request', () => {
		void updatePromptState();
	});

	const process = php.run();

	await waitForPrompt(php);
	await php.provideInput(`exec ${startPath}`);
	await php.provideInput('set pagination off');
	await updatePromptState();
	setStatus('ready');
	await process;
};

main().catch(error => {
	appendStderr([`${String(error)}\n`]);
	setStatus('failed');
	throw error;
});
