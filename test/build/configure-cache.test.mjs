import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {copyFile, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

/**
 * Evaluates the real Make configuration without entering the native builder.
 * @param {string[]} settings Make variable assignments.
 * @param {string[]} targets Targets or extra Make arguments.
 * @param {object} env Environment inherited by Make.
 * @returns {Promise<object>} Captured Make output.
 */
const make = (settings = [], targets = [], env = process.env) => run('make', [
	'--no-print-directory', 'ENV_FILE=.github/.env_8.4.static.ci'
	, ...settings, ...targets
], {env, maxBuffer: 4 * 1024 * 1024});

/**
 * Reads the cache selected by the production configure recipe.
 * @param {string[]} settings Make variable assignments.
 * @returns {Promise<string>} Cache filename relative to the build root.
 */
async function cache(settings = [])
{
	const {stdout} = await make(settings, [
		'--eval', '__configure_cache:;@printf "%s\\n" "$(PHP_CONFIGURE_CACHE)"'
		, '__configure_cache'
	]);
	assert.match(stdout.trim(), /^\.cache\/php-configure\/php8\.[0-5]\.\d+\/[a-f0-9]+\.cache$/);
	return stdout.trim();
}

test('PHP configure caches separate versions and effective configurations', async () => {
	const base = await cache(['WITH_SDL=1']);
	for(const settings of [
		['PHP_VERSION=8.0', 'WITH_SDL=1']
		, ['ENV_FILE=.github/.env_8.4.shared.ci', 'WITH_SDL=1']
		, ['ENV_FILE=.github/.env_8.4.dynamic.ci', 'WITH_SDL=1']
		, ['WITH_SDL=0']
		, ['WITH_SDL=1', 'WITH_SDL_IMAGE=0', 'WITH_SDL_MIXER=0', 'WITH_SDL_TTF=0', 'WITH_OPENGL=0']
		, ['WITH_SDL=1', 'PHP_CONFIGURE_VARS=LDFLAGS=-sASYNCIFY=1 ac_cv_fixture=yes']
		, ['WITH_SDL=1', 'CONFIGURE_FLAGS=--enable-fixture']
	]) {
		assert.notEqual(await cache(settings), base, settings.join(' '));
	}
	assert.equal(await cache(['WITH_SDL=1', 'PHP_DIST_DIR=.cache/other-output']), base);
	assert.equal(await cache(['WITH_SDL=1', 'CPU_COUNT=1', 'MAX_LOAD=2']), base);
});

test('configure stamps detect flag changes while preserving unchanged timestamps', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'php-wasm-configure-cache-'));
	t.after(() => rm(directory, {recursive: true, force: true}));
	const stamp = join(directory, 'configuration');
	const settings = [`PHP_CONFIGURE_STAMP=${stamp}`, 'WITH_SDL=1'];
	await make(settings, [stamp]);
	const first = await readFile(stamp, 'utf8');
	const mtime = (await stat(stamp)).mtimeMs;
	await make(settings, [stamp]);
	assert.equal((await stat(stamp)).mtimeMs, mtime);
	await make([...settings, 'WITH_OPENGL=0'], [stamp]);
	assert.notEqual(await readFile(stamp, 'utf8'), first);
	await make(settings, [stamp]);
	assert.equal(await readFile(stamp, 'utf8'), first);
});

test('CI build snapshots retain their configure stamp when runtime tests select the same profile', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'php-wasm-ci-profile-'));
	t.after(() => rm(directory, {recursive: true, force: true}));
	const workflow = await readFile('.github/workflows/build-step.yaml', 'utf8');
	const jobEnvironment = workflow.match(/^    env:\n((?:      .+\n)+)/m)?.[1] ?? '';
	const profile = jobEnvironment.match(/^      LIB_TYPE: (.+)$/m)?.[1];
	const cleanEnvironment = {...process.env, MAKEFLAGS: '', MFLAGS: '', MAKEOVERRIDES: ''};
	delete cleanEnvironment.LIB_TYPE;
	const envFile = join(directory, '.env');
	const stamp = join(directory, 'configuration');

	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		for(const libType of ['dynamic', 'shared', 'static'])
		{
			await t.test(`${version} ${libType}`, async () => {
				await copyFile(`.github/.env_${version}.${libType}.ci`, envFile);
				const settings = [`ENV_FILE=${envFile}`, `PHP_CONFIGURE_STAMP=${stamp}`];
				const buildEnvironment = {...cleanEnvironment};
				if(profile !== undefined)
				{
					buildEnvironment.LIB_TYPE = profile.replace('${{ inputs.libType }}', libType);
				}
				await make(settings, [stamp], buildEnvironment);
				const built = await readFile(stamp, 'utf8');
				const timestamp = (await stat(stamp, {bigint: true})).mtimeNs;
				await make([...settings, `PHP_VERSION=${version}`, `LIB_TYPE=${libType}`], [stamp], cleanEnvironment);
				assert.equal(await readFile(stamp, 'utf8'), built, 'Testing a restored build must select its original configure cache');
				assert.equal((await stat(stamp, {bigint: true})).mtimeNs, timestamp, 'Testing a restored build must not invalidate native outputs');
			});
		}
	}
});

test('PHP cleanup removes the selected version cache from the build root', async () => {
	const {stdout} = await make(['PHP_VERSION=8.0'], ['-n', 'php-clean']);
	assert.match(stdout, /rm -rf \.cache\/php-configure\/php8\.0\.30/);
	assert.match(stdout, /rm -f \.cache\/php-configure-8\.0/);
	assert.doesNotMatch(stdout, /-w \/src\/third_party\/php8\.0-src\/.*rm -f \.cache\/config-cache/);
});
