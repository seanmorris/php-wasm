import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { generateRuntimeTypes, runtimePackages } from '../../bin/generate-runtime-types.mjs';
import {packageSdl, verifySdl, sdlProfile} from '../../bin/package-sdl.mjs';
import {copyRuntimeSources} from '../../bin/runtime-package.mjs';
import { packageCloudflare, verifyCloudflare } from '../../bin/package-cloudflare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsc = path.join(repoRoot, 'node_modules/typescript/bin/tsc');
const versions = ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];

/**
 * Runs a compiler or packaging command and preserves diagnostics on failure.
 * @param {string} command Executable to run.
 * @param {string[]} args Command arguments.
 * @param {string} cwd Working directory.
 * @param {object} options Expected command outcome.
 * @param {boolean} options.failure Whether failure is being tested.
 * @returns {object} Captured process result.
 */
function run(command, args, cwd = repoRoot, {failure = false} = {})
{
	const result = spawnSync(command, args, {cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
	assert.ifError(result.error);
	if(!failure) assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
	return result;
}

/**
 * Allocates an isolated consumer directory owned by the test.
 * @param {import('node:test').TestContext} t Test context.
 * @returns {Promise<string>} Temporary directory.
 */
async function temporary(t)
{
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'php-wasm-types-'));
	t.after(() => fs.rm(root, {recursive: true, force: true}));
	return root;
}

// Exercise fresh source wrappers. Tiny native factories stand in for the PHP
// build only; no declaration may be loaded from a checkout's generated output.
/**
 * Copies source wrappers or verifies wrappers freshly staged by Make.
 * @param {string} directory Destination directory.
 * @param {string} name Wrapper filename.
 * @param {object} options Output formats.
 * @param {boolean} options.commonjs Whether the package includes CommonJS.
 * @param {boolean} options.staged Whether Make already staged the wrappers.
 * @param {Set<string>} visited Already staged modules.
 * @returns {Promise<void>} Resolves after staging the module graph.
 */
async function copyWrapper(directory, name, {commonjs = false, staged = false} = {}, visited = new Set())
{
	if(visited.has(name)) return;
	visited.add(name);
	await fs.mkdir(directory, {recursive: true});
	if(/^php8\./.test(name))
	{
		await fs.writeFile(path.join(directory, name), 'export default function runtime() { throw new Error("Type fixture has no native PHP"); }\n');
		if(commonjs) await fs.writeFile(path.join(directory, name.replace(/\.mjs$/, '.js')), 'module.exports = function runtime() { throw new Error("Type fixture has no native PHP"); };\n');
		return;
	}
	const source = path.join(repoRoot, 'source', name);
	const content = await fs.readFile(source, 'utf8');
	if(staged) assert.equal(await fs.readFile(path.join(directory, name), 'utf8'), content, `Make must stage current source: ${name}`);
	else await fs.writeFile(path.join(directory, name), content);
	if(commonjs) await fs.access(path.join(directory, name.replace(/\.mjs$/, '.js')));
	for(const match of content.matchAll(/(?:from\s*|import\s*\(|loadRuntime\()['"`]\.\/([^'"`]+\.mjs)['"`]/g))
		await copyWrapper(directory, match[1], {commonjs, staged}, visited);
}

/**
 * Checks consumers under both TypeScript resolvers and pinned Deno.
 * @param {string} root Isolated consumer directory.
 * @param {string[]} files Consumer fixtures.
 * @returns {Promise<void>} Resolves once every compiler has passed.
 */
async function typecheck(root, files)
{
	for(const moduleResolution of ['Bundler', 'NodeNext'])
	{
		const config = {
			compilerOptions: {
				target: 'ES2022'
				, module: moduleResolution === 'Bundler' ? 'Preserve' : 'NodeNext'
				, moduleResolution, strict: true, skipLibCheck: false, noEmit: true
				, verbatimModuleSyntax: true
				, types: []
				, lib: ['ES2022', 'DOM', 'DOM.Iterable']
			}
			, files
		};
		await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify(config));
		run(process.execPath, [tsc, '-p', 'tsconfig.json'], root);
	}
	await fs.writeFile(path.join(root, 'deno.json'), JSON.stringify({nodeModulesDir: 'manual', compilerOptions: {strict: true, skipLibCheck: false, lib: ['deno.window', 'dom', 'dom.iterable']}}));
	run('deno', ['check', '--config', 'deno.json', ...files.filter(file => file.endsWith('.mts'))], root);
}

test('Deno 2.5.6 checks fresh source and copied wrappers, and catches the original three errors', async t => {
	assert.match(run('deno', ['--version']).stdout, /^deno 2\.5\.6 /);
	const root = await temporary(t);
	const source = path.join(root, 'source');
	const copied = path.join(root, 'copied/packages/php-wasm');
	const wrappers = (await fs.readdir(path.join(repoRoot, 'source'))).filter(name => /^Php.*\.mjs$/.test(name));
	for(const name of wrappers) await copyWrapper(source, name);
	await copyWrapper(copied, 'PhpBase.mjs');
	await fs.writeFile(path.join(root, 'entry.mjs'), [...wrappers.map(name => `import './source/${name}';`), "import './copied/packages/php-wasm/PhpBase.mjs';"].join('\n'));
	await fs.writeFile(path.join(root, 'deno.json'), JSON.stringify({compilerOptions: {strict: true, skipLibCheck: false}}));
	run('deno', ['check', '--config', 'deno.json', 'entry.mjs'], root);

	for(const file of [path.join(source, 'PhpBase.mjs'), path.join(copied, 'PhpBase.mjs')])
	{
		const contents = await fs.readFile(file, 'utf8');
		await fs.writeFile(file, contents.replace('Promise<PhpModuleFactory|PhpRuntimeFactory>', "Promise<import('../packages/php-wasm/public').PhpBaseModuleFactory|import('../packages/php-wasm/public').PhpRuntimeFactory>"));
	}
	const cloud = path.join(source, 'PhpCloudflare.mjs');
	await fs.writeFile(cloud, (await fs.readFile(cloud, 'utf8')).replace('{PhpCloudflareArgs}', "{import('../packages/php-cloud-wasm/public').PhpCloudflareArgs}"));
	const broken = run('deno', ['check', '--reload', '--config', 'deno.json', 'entry.mjs'], root, {failure: true});
	assert.notEqual(broken.status, 0, 'Restoring the broken JSDoc imports must fail');
	assert.match(broken.stderr, /Found 3 errors/);
	assert.match(broken.stderr, /packages\/packages\/php-wasm\/public/);
});

test('source declarations check without skipLibCheck and generated CJS declarations are current', async () => {
	await generateRuntimeTypes(repoRoot, {check: true});
	run(process.execPath, [tsc, '-p', 'jsconfig.json', '--skipLibCheck', 'false']);
});

test('isolated npm packages expose every typed entry to ESM, CommonJS, Deno and standalone Cloudflare/SDL consumers', async t => {
	const root = await temporary(t);
	const installed = path.join(root, 'consumer');
	await fs.mkdir(installed);
	const esm = [], cjs = [], smoke = [], requireSmoke = [];
	let index = 0;
	// Use the same staging target as native artifact jobs. No native outputs
	// exist here, so omitted wrappers cannot hide behind a previous local build.
	const stageRoot = path.join(root, 'stage');
	run('make', ['--no-print-directory', '-j2', 'runtime-wrappers'
		, 'ENV_FILE=/dev/null', 'EXTENSION_PACKAGE_DIRS=', 'DOCKER_COMPOSE=false'
		, `PHP_DIST_DIR=${path.join(stageRoot, 'php-wasm')}`
		, `PHP_CGI_DIST_DIR=${path.join(stageRoot, 'php-cgi-wasm')}`
		, `PHP_CLI_DIST_DIR=${path.join(stageRoot, 'php-cli-wasm')}`
		, `PHP_DBG_DIST_DIR=${path.join(stageRoot, 'php-dbg-wasm')}`
		, `PHP_CLOUD_WRAPPER_DIR=${path.join(stageRoot, 'php-cloud-wasm')}`
		, `PHP_SDL_WRAPPER_DIR=${path.join(stageRoot, 'php-sdl-wasm')}`]);
	for(const name of runtimePackages)
		assert.ok((await fs.readdir(path.join(stageRoot, name))).every(file => !/^php8\.|\.wasm$/.test(file)), 'Wrapper staging must preserve native JS/Wasm outputs');
	for(const name of runtimePackages)
	{
		const template = path.join(repoRoot, 'packages', name);
		const stage = path.join(root, 'stage', name);
		await fs.mkdir(stage, {recursive: true});
		const declarations = (await fs.readdir(template)).filter(file => /\.d\.(?:ts|mts|cts)$/.test(file) && !/^php8\./.test(file));
		for(const file of ['package.json', 'README.md', 'LICENSE', 'NOTICE', ...declarations])
			await fs.copyFile(path.join(template, file), path.join(stage, file));
		const commonjs = !['php-cloud-wasm', 'php-sdl-wasm'].includes(name);
		const visited = new Set();
		for(const file of declarations.filter(file => file.endsWith('.d.mts')))
			await copyWrapper(stage, file.replace('.d.mts', '.mjs'), {commonjs: commonjs && !file.startsWith('php-tags'), staged: true}, visited);
		const pkg = JSON.parse(await fs.readFile(path.join(stage, 'package.json'), 'utf8'));
		for(const value of Object.values(pkg.exports))
			if(value?.import?.endsWith?.('.mjs') && !value.import.includes('*')) await copyWrapper(stage, value.import.slice(2), {commonjs: commonjs && !value.import.startsWith('./php-tags'), staged: true}, visited);
		if(!commonjs)
		{
			assert.equal(pkg.dependencies, undefined, `${name} must remain standalone`);
			const profile = name === 'php-sdl-wasm' ? 'sdl' : 'cloudflare';
			if(profile === 'sdl') await copyRuntimeSources(stage, sdlProfile);
			const pack = profile === 'sdl' ? packageSdl : packageCloudflare;
			const verify = profile === 'sdl' ? verifySdl : verifyCloudflare;
			for(const version of versions)
			{
				const runtime = `php${version}-${profile}-runtime.mjs`;
				await fs.writeFile(path.join(stage, runtime), `const wasm = '${runtime}.wasm'; export default async () => ({});\n`);
				await fs.writeFile(path.join(stage, `${runtime}.wasm`), new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
				await pack(stage, version, {fixture: true});
			}
			for(const version of versions) await verify(stage, version);
		}
		const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], stage).stdout);
		const packedFiles = new Set(packed.files.map(file => file.path));
		const metadata = [pkg.main, pkg.module, pkg.types, pkg.exports];
		while(metadata.length)
		{
			const value = metadata.pop();
			if(value && typeof value === 'object') metadata.push(...Object.values(value));
			else if(typeof value === 'string' && !value.includes('*'))
				assert.ok(packedFiles.has(value.replace(/^\.\//, '')), `${name} metadata target is missing from npm pack output: ${value}`);
		}
		const target = path.join(installed, 'node_modules', name);
		await fs.mkdir(target, {recursive: true});
		run('tar', ['-xzf', path.join(root, packed.filename), '--strip-components=1', '-C', target]);
		for(const file of declarations) assert.ok(packed.files.some(entry => entry.path === file), `npm pack omitted ${name}/${file}`);
		const specifiers = new Set([
			...Object.entries(pkg.exports).filter(([key, value]) => !key.includes('*') && (value.types || value.import?.types)).map(([key]) => key)
			, ...declarations.filter(file => file.endsWith('.d.mts')).map(file => './' + file.replace('.d.mts', '.mjs'))
		]);
		for(const specifier of specifiers)
		{
			const full = name + (specifier === '.' ? '' : '/' + specifier.slice(2));
			const binding = `entry${index++}`;
			const constructor = specifier === '.' ? path.basename(pkg.main, '.js') : path.basename(specifier).replace(/\.(?:mjs|js)$/, '');
			if(constructor.startsWith('Php')) smoke.push(`if(typeof (await import('${full}')).${constructor} !== 'function') throw new Error('Missing constructor: ${full}');`);
			if(commonjs && constructor.startsWith('Php') && !specifier.endsWith('.mjs')) requireSmoke.push(`if(typeof require('${full}').${constructor} !== 'function') throw new Error('Missing constructor: ${full}');`);
			if(specifier === './public') esm.push(`import type * as ${binding} from '${full}';`);
			else if(specifier.endsWith('.js')) cjs.push(`import ${binding} = require('${full}');\nvoid ${binding};`);
			else
			{
				esm.push(`import * as ${binding} from '${full}';\nvoid ${binding};`);
				if(commonjs && !specifier.endsWith('.mjs') && !specifier.startsWith('./php-tags'))
					cjs.push(`import ${binding} = require('${full}');\nvoid ${binding};`);
			}
		}
	}
	for(const file of ['runtime.mts', 'runtime.cts', 'cloudflare.mts', 'sdl.mts', 'embedded.mts'])
		await fs.copyFile(path.join(repoRoot, 'test/types', file), path.join(installed, file));
	await fs.writeFile(path.join(installed, 'entries.mts'), esm.join('\n'));
	await fs.writeFile(path.join(installed, 'entries.cts'), cjs.join('\n'));
	await fs.writeFile(path.join(installed, 'constructors.mjs'), smoke.join('\n'));
	run(process.execPath, ['constructors.mjs'], installed);
	await fs.writeFile(path.join(installed, 'constructors.cjs'), requireSmoke.join('\n'));
	run(process.execPath, ['constructors.cjs'], installed);
	let cloud = await fs.readFile(path.join(installed, 'cloudflare.mts'), 'utf8');
	for(const [index, version] of versions.entries()) cloud += `\nimport Default${index}, { PhpCloudflare as Php${index} } from 'php-cloud-wasm/php${version}-cloudflare.mjs';\nconst php${index} = new Php${index}(options);\nnew Default${index}();\nconst run${index}: Promise<number> = php${index}.run('<?php echo 1;');\n// @ts-expect-error Fixed version entrypoints reject version overrides.\nnew Php${index}({ version: '8.0' });\n`;
	await fs.writeFile(path.join(installed, 'cloudflare.mts'), cloud);
	let sdl = await fs.readFile(path.join(installed, 'sdl.mts'), 'utf8');
	for(const [index, version] of versions.entries()) sdl += `\nimport Default${index}, { PhpSdl as Sdl${index} } from 'php-sdl-wasm/php${version}-sdl.mjs';\nconst sdl${index} = new Sdl${index}(options);\nnew Default${index}();\nconst run${index}: Promise<number> = sdl${index}.run('<?php echo 1;');\nconst refresh${index}: Promise<void> = sdl${index}.refresh();\n// @ts-expect-error Fixed version entrypoints reject version overrides.\nnew Sdl${index}({ version: '8.0' });\n// @ts-expect-error Embedded SDL executes PHP strings rather than CLI arguments.\nsdl${index}.run(['-v']);\n`;
	await fs.writeFile(path.join(installed, 'sdl.mts'), sdl);
	await typecheck(installed, ['runtime.mts', 'runtime.cts', 'cloudflare.mts', 'sdl.mts', 'entries.mts', 'entries.cts']);

	// Compile each specialized runtime with no other runtime package installed.
	for(const [name, fixture] of [['php-cloud-wasm', 'cloudflare.mts'], ['php-sdl-wasm', 'sdl.mts'], ['php-wasm', 'embedded.mts']])
	{
		const standalone = path.join(root, name + '-standalone');
		await fs.mkdir(path.join(standalone, 'node_modules'), {recursive: true});
		await fs.cp(path.join(installed, 'node_modules', name), path.join(standalone, 'node_modules', name), {recursive: true});
		await fs.copyFile(path.join(installed, fixture), path.join(standalone, fixture));
		await typecheck(standalone, [fixture]);
	}
});
