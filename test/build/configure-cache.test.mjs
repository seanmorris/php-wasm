import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

/**
 * Evaluates the real Make configuration without entering the native builder.
 * @param {string[]} settings Make variable assignments.
 * @param {string[]} targets Targets or extra Make arguments.
 * @returns {Promise<object>} Captured Make output.
 */
const make = (settings = [], targets = []) => run('make', [
	'--no-print-directory', 'ENV_FILE=.github/.env_8.4.static.ci'
	, ...settings, ...targets
], {maxBuffer: 4 * 1024 * 1024});

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

test('PHP cleanup removes the selected version cache from the build root', async () => {
	const {stdout} = await make(['PHP_VERSION=8.0'], ['-n', 'php-clean']);
	assert.match(stdout, /rm -rf \.cache\/php-configure\/php8\.0\.30/);
	assert.match(stdout, /rm -f \.cache\/php-configure-8\.0/);
	assert.doesNotMatch(stdout, /-w \/src\/third_party\/php8\.0-src\/.*rm -f \.cache\/config-cache/);
});
