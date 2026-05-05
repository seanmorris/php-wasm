import { PhpCliWeb } from '/packages/php-cli-wasm/PhpCliWeb.mjs';

import {
	appendStderr,
	appendStdout,
	buildType,
	createIni,
	query,
	runtimeVersion,
	setMeta,
	setStatus,
} from './common.mjs';
import { loadCliSharedLibs } from './runtime-libs.mjs';

const main = async () => {
	setStatus('loading');

	const php = new PhpCliWeb({
		code: query.get('code') ?? 'echo "Hello, World!";'
		, ini: createIni()
		, persist: [{mountPath: '/persist'}, {mountPath: '/config'}]
		, sharedLibs: loadCliSharedLibs(buildType)
		, version: runtimeVersion
	});

	php.addEventListener('output', event => appendStdout(event.detail));
	php.addEventListener('error', event => appendStderr(event.detail));

	setStatus('running');

	const exitCode = await php.run();

	setMeta('exit-code', exitCode);
	setStatus(exitCode === 0 ? 'done' : 'failed');

	if(exitCode !== 0)
	{
		throw new Error(`PHP CLI exited with code ${exitCode}.`);
	}
};

main().catch(error => {
	appendStderr([`${String(error)}\n`]);
	setStatus('failed');
	throw error;
});
