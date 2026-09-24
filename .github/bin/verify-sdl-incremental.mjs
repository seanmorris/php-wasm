import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir, open, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

const [version, directory = `.cache/sdl-raw/php${version}`, output = `.cache/sdl-incremental-${version}.json`] = process.argv.slice(2);
assert.match(version ?? '', /^8\.[0-5]$/, 'Usage: verify-sdl-incremental.mjs PHP_VERSION [RUNTIME_DIR] [REPORT]');
const source = `third_party/php${version}-src`;
const runtime = join(directory, `php${version}_sdl-web.mjs`);
const settings = [
	`PHP_VERSION=${version}`, 'WITH_SDL=1'
	, `PHP_DIST_DIR=${directory}`, `PHP_ASSET_DIR=${directory}`
];

/**
 * Records native objects without traversing Git's unrelated object database.
 * @param {string} directory Native source directory.
 * @returns {Promise<string[]>} Compiled object filenames.
 */
async function objects(directory)
{
	const files = [];
	for(const entry of await readdir(directory, {withFileTypes: true}))
	{
		const name = join(directory, entry.name);
		if(entry.isDirectory() && entry.name !== '.git')
		{
			files.push(...await objects(name));
		}
		else if(entry.isFile() && /\.(?:lo|o)$/.test(name))
		{
			files.push(name);
		}
	}
	return files;
}

/**
 * Captures exact timestamps so a redundant compilation cannot pass unnoticed.
 * @param {string[]} files Native configuration, object and output filenames.
 * @returns {Promise<object>} File sizes and nanosecond modification times.
 */
async function snapshot(files)
{
	return Object.fromEntries(await Promise.all(files.map(async name => {
		const info = await stat(name, {bigint: true});
		return [name, {size: String(info.size), mtimeNs: String(info.mtimeNs)}];
	})));
}

/**
 * Runs ordinary Make with a durable log and preserves build failures.
 * @param {string[]} targets Make targets and dependency simulation flags.
 * @param {string} log Build log filename.
 * @returns {Promise<void>} Resolves after a successful native command.
 */
async function make(targets, log)
{
	const file = await open(log, 'w');
	try
	{
		await new Promise((resolve, reject) => {
			const child = spawn('make', ['--no-print-directory', ...settings, ...targets], {
				stdio: ['ignore', file.fd, file.fd]
			});
			child.on('error', reject);
			child.on('exit', (code, signal) => {
				if(code === 0)
				{
					resolve();
				}
				else
				{
					reject(new Error(`Make failed (${signal ?? code}); see ${log}`));
				}
			});
		});
	}
	catch(error)
	{
		const lines = (await readFile(log, 'utf8')).split('\n').slice(-60);
		console.error(lines.map(line => line.slice(0, 1200)).join('\n'));
		throw error;
	}
	finally
	{
		await file.close();
	}
}

const compiled = await objects(source);
assert.ok(compiled.length > 0, 'Build the SDL runtime before verifying incremental links');
const protectedFiles = [
	...compiled
	, `${source}/configured`, `${source}/main/php_config.h`
	, `${source}/ext/standard/credits_ext.h`
	, `${source}/ext/standard/credits_sapi.h`
	, `.cache/php-configure-${version}`
];
const artifacts = [runtime, `${runtime}.wasm`];
const initial = await snapshot([...protectedFiles, ...artifacts]);
const report = {version, directory, compiledObjects: compiled.length, checks: []};
await mkdir(dirname(output), {recursive: true});

for(const [name, targets] of [
	['unchanged', ['web-mjs']]
	, ['javascript', ['-W', 'packages/php-sdl-wasm/js/pointer-lock.js', runtime]]
]) {
	const log = `${output}.${name}.log`;
	await make(targets, log);
	assert.deepEqual((await objects(source)).sort(), [...compiled].sort());
	const current = await snapshot([...protectedFiles, ...artifacts]);
	const nativeChanges = protectedFiles.filter(file => JSON.stringify(current[file]) !== JSON.stringify(initial[file]));
	const rebuiltArtifacts = artifacts.filter(file => current[file].mtimeNs !== initial[file].mtimeNs);
	report.checks.push({name, targets, log, nativeChanges, rebuiltArtifacts});
	await writeFile(output, JSON.stringify(report, null, 2) + '\n');
	assert.deepEqual(nativeChanges, [], `${name} build changed native objects/configuration`);
	assert.deepEqual(rebuiltArtifacts, name === 'javascript' ? artifacts : []);
	console.log(`${name}: ${compiled.length} native objects unchanged; ${rebuiltArtifacts.length} artifacts rebuilt`);
}
