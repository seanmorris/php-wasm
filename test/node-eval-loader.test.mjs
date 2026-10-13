import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const packages = new URL('../packages/', import.meta.url);
const testLib = new URL('./lib/', import.meta.url);

// Eval scripts expose a global require and __dirname. The wrappers must still
// load the runtime that sits beside them, in either module format.
const wrappers = [
	{name: 'PhpNode', dir: 'php-wasm', runtime: 'php', loaded: 'binary'}
	, {name: 'PhpCgiNode', dir: 'php-cgi-wasm', runtime: 'cgi', loaded: 'binLoader'}
	, {name: 'PhpCliNode', dir: 'php-cli-wasm', runtime: 'cli', loaded: 'binary'}
	, {name: 'PhpDbgNode', dir: 'php-dbg-wasm', runtime: 'dbg', loaded: 'binary'}
];

const evalLoad = async source => {
	const {stdout} = await run(process.execPath, ['-e', source], {cwd: fileURLToPath(new URL('..', import.meta.url))});
	return stdout.trim();
};

for(const {name, dir, runtime, loaded} of wrappers)
{
	test(`${name} loads its runtime from an ESM eval script`, {skip: typeof Deno !== 'undefined'}, async () => {
		const wrapper = new URL(`${dir}/${name}.mjs`, packages).href;
		const options = new URL('node-runtime-options.mjs', testLib).href;
		// No top-level await: Node would otherwise evaluate the script as ESM,
		// hiding the global require this test needs.
		const output = await evalLoad(`
			Promise.all([import(${JSON.stringify(options)}), import(${JSON.stringify(wrapper)})])
				.then(([{nodeRuntimeOptions}, {${name}}]) => new ${name}(nodeRuntimeOptions({runtime: ${JSON.stringify(runtime)}})).${loaded})
				.then(() => { console.log('loaded'); process.exit(0); });
		`);
		assert.equal(output.split('\n').at(-1), 'loaded');
	});

	test(`${name} loads its runtime from a CommonJS eval script`, {skip: typeof Deno !== 'undefined'}, async () => {
		const wrapper = fileURLToPath(new URL(`${dir}/${name}.js`, packages));
		const options = fileURLToPath(new URL('node-runtime-options.cjs', testLib));
		const output = await evalLoad(`
			const {nodeRuntimeOptions} = require(${JSON.stringify(options)});
			const {${name}} = require(${JSON.stringify(wrapper)});
			const php = new ${name}(nodeRuntimeOptions({runtime: ${JSON.stringify(runtime)}}));
			php.${loaded}.then(() => { console.log('loaded'); process.exit(0); });
		`);
		assert.equal(output.split('\n').at(-1), 'loaded');
	});
}
