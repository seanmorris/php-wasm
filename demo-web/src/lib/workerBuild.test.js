// @vitest-environment node
/**
 * Exercises the preserved worker graph through Vite's real public middleware.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer } from 'vite';
import workerConfig from '../../vite.worker.config.mjs';

it('serves every worker module and native asset without checkout or node_modules URLs', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'php-wasm-worker-graph-'));
	const dependency = path.join(root, 'node_modules/runtime-fixture');
	const publicDir = path.join(root, 'public');
	let server;

	try
	{
		await mkdir(dependency, {recursive: true});
		await writeFile(path.join(dependency, 'index.js'), `
			import wasm from './native.wasm?url';
			export {wasm};
			export const load = () => import('./lazy.js');
		`);
		await writeFile(path.join(dependency, 'lazy.js'), 'export const ready = true;');
		await writeFile(path.join(dependency, 'native.wasm'), new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
		await mkdir(publicDir);
		server = await createServer({
			configFile: false
			, root
			, publicDir
			, base: workerConfig.base
			, logLevel: 'silent'
			, server: {host: '127.0.0.1', port: 0}
			, optimizeDeps: {noDiscovery: true}
		});
		await server.listen();
		const origin = `http://127.0.0.1:${server.httpServer.address().port}`;

		// Build after startup, when Vite must discover new hashes through its watcher.
		const result = await build({
			...workerConfig
			, configFile: false
			, root
			, logLevel: 'silent'
			, plugins: [{
				name: 'worker-graph-fixture'
				, load(id) {
					if(id === workerConfig.build.rollupOptions.input)
					{
						return `export {wasm, load} from ${JSON.stringify(path.join(dependency, 'index.js'))};`;
					}
				}
			}]
			, build: {
				...workerConfig.build
				, outDir: publicDir
				, assetsInlineLimit: 0
				, sourcemap: false
			}
		});

		const entry = result.output.find(file => file.fileName === 'cgi-worker.js');

		expect(entry).toBeDefined();
		expect(result.output.some(file => file.fileName.endsWith('.wasm'))).toBe(true);

		for(const file of result.output)
		{
			let response;

			await vi.waitFor(async () => {
				response = await fetch(`${origin}${workerConfig.base}${file.fileName}`);
				expect(response.status, file.fileName).toBe(200);
			}, {timeout: 2000});

			if(file.type === 'chunk')
			{
				expect(await response.text()).toBe(file.code);
			}
			else
			{
				expect(response.headers.get('content-type')).toBe('application/wasm');
				expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(file.source));
			}

			if(file !== entry)
			{
				expect(file.fileName).toMatch(/^worker-assets\/[^/]+$/);
			}
		}
	}
	finally
	{
		await server?.close();
		await rm(root, {recursive: true, force: true});
	}
});
