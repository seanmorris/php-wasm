import {test, expect} from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const libType = process.env.LIB_TYPE ?? process.env.BUILD_TYPE ?? 'dynamic';

test.skip(process.env.PHP_VARIANT === '_sdl', 'SDL has its own browser entry point.');

for(const entrypoint of ['PhpWorker', 'PhpWebview', 'PhpCgiWeb', 'PhpCgiWebview'])
{
	test(`boots the public ${entrypoint} entry point`, async ({page}) => {
		await page.goto('harness/runtime-entrypoints.html');
		const options = {entrypoint, version, libType};
		const pageError = new Promise((_, reject) => page.once('pageerror', reject));
		const result = await Promise.race([page.evaluate(async options => {
			if(options.entrypoint !== 'PhpWorker')
			{
				const {runEntrypoint} = await import('/php-wasm/harness/runtime-entrypoints.mjs');
				return runEntrypoint(options);
			}
			const worker = new Worker('/php-wasm/harness/runtime-entrypoints-worker.mjs', {type: 'module'});
			try
			{
				return await new Promise((resolve, reject) => {
					worker.onerror = event => reject(new Error(event.message));
					worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data.result);
					worker.postMessage(options);
				});
			}
			finally
			{
				worker.terminate();
			}
		}, options)
		, pageError]);
		expect(result.status).toBe(entrypoint.startsWith('PhpCgi') ? 200 : 0);
		expect(result.result.version).toMatch(new RegExp(`^${version.replace('.', '\\.')}\\.`));
		expect(result.result.sapi).toBe(entrypoint.startsWith('PhpCgi') ? 'cgi-fcgi' : 'embed');
		expect(result.result.bridge).toBe(true);
		expect(result.result.preloaded).toBe(true);
		if(!entrypoint.startsWith('PhpCgi')) expect(result.stderr).toBe('');
	});
}
