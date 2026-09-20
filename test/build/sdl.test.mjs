import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const inventory = '__sdl_inventory:;@echo $(WITH_SDL_IMAGE) $(WITH_SDL_MIXER) $(WITH_SDL_TTF) $(WITH_OPENGL); echo $(PHP_VARIANT); echo $(PHP_CONFIGURE_DEPS); echo $(SHARED_LIBS); echo $(ARCHIVES)';

/**
 * Evaluates the actual Make configuration without compiling native code.
 * @param {string[]} settings Make variable assignments.
 * @returns {Promise<object>} Captured Make output.
 */
const configure = settings => run('make', [
	'--no-print-directory', 'ENV_FILE=.github/.env_8.4.static.ci'
	, ...settings, '--eval', inventory, '__sdl_inventory'
], {maxBuffer: 1024 * 1024});

test('SDL add-ons follow the main flag and can all be opted out', async () => {
	assert.match((await configure(['WITH_SDL=0'])).stdout, /^0 0 0 0\n/);
	for(const flag of ['1', 'dynamic'])
	{
		const {stdout} = await configure([`WITH_SDL=${flag}`]);
		assert.match(stdout, /^1 1 1 1\n_sdl\n/);
		for(const name of ['sdl_image', 'sdl_mixer', 'sdl_ttf', 'opengl'])
		{
			assert.ok(stdout.includes(`ext/${name}/config.m4`));
		}
	}
	const {stdout} = await configure(['WITH_SDL=1', 'WITH_SDL_IMAGE=0', 'WITH_SDL_MIXER=0', 'WITH_SDL_TTF=0', 'WITH_OPENGL=0']);
	assert.match(stdout, /^0 0 0 0\n_sdl\n/);
	assert.doesNotMatch(stdout, /ext\/(sdl_image|sdl_mixer|sdl_ttf|opengl)\//);
});

test('SDL rejects invalid options and disabled codec prerequisites', async () => {
	for(const option of ['WITH_SDL_IMAGE', 'WITH_SDL_MIXER', 'WITH_SDL_TTF', 'WITH_OPENGL'])
	{
		await assert.rejects(configure(['WITH_SDL=1', `${option}=dynamic`]), new RegExp(`${option} MUST BE 0 OR 1`));
		await assert.rejects(configure(['WITH_SDL=1', `${option}=0 1`]), new RegExp(`${option} MUST BE 0 OR 1`));
		await assert.rejects(configure(['WITH_SDL=0', `${option}=1`]), /SDL add-ons require WITH_SDL=1/);
	}
	await assert.rejects(configure(['WITH_SDL=1', 'WITH_LIBPNG=0']), /requires WITH_LIBPNG/);
	await assert.rejects(configure(['WITH_SDL=1', 'WITH_FREETYPE=0']), /requires WITH_FREETYPE/);
});

test('SDL reuses the selected shared or static codec providers', async () => {
	const {stdout: shared} = await configure(['WITH_SDL=1', 'WITH_GD=0', 'WITH_LIBPNG=shared', 'WITH_LIBJPEG=shared', 'WITH_FREETYPE=shared', 'WITH_ZLIB=dynamic']);
	for(const name of ['libpng', 'libjpeg', 'libfreetype'])
	{
		assert.ok(shared.split('\n')[3].includes(`packages/gd/${name}.so`));
	}
	assert.ok(shared.split('\n')[3].includes('packages/zlib/libz.so'));
	assert.doesNotMatch(shared.split('\n')[4], /lib\/lib\/(libpng|libjpeg|libfreetype|libz)\.a/);
	const {stdout: statically} = await configure(['WITH_SDL=1', 'WITH_GD=0', 'WITH_ZLIB=0']);
	assert.doesNotMatch(statically.split('\n')[3], /libz\.so/);
	for(const name of ['libpng', 'libjpeg', 'libfreetype', 'libz'])
	{
		assert.ok(statically.split('\n')[4].includes(`lib/lib/${name}.a`));
	}
});

test('the SDL npm payload includes reproducible build inputs and the compatibility shim', async () => {
	const {stdout} = await run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: new URL('../../packages/sdl', import.meta.url), maxBuffer: 1024 * 1024});
	const [{files}] = JSON.parse(stdout);
	const names = files.map(file => file.path);
	for(const name of ['index.mjs', 'extensions.mak', 'patches/sdl-events.patch', 'patches/sdl-asyncify.patch', 'patches/sdl_image.patch', 'patches/sdl_mixer.patch', 'patches/sdl_ttf.patch', 'patches/opengl.patch', 'mixer/php_sdl_mixer_rw.h', 'opengl/php_webgl.c', 'opengl/php_webgl_arginfo.h', 'opengl/php_webgl.stub.php', 'opengl/LICENSE'])
	{
		assert.ok(names.includes(name), name);
	}
	assert.equal(names.some(name => /\.(wasm|so)$/.test(name)), false);
});
