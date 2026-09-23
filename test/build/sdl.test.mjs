import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const inventory = '__sdl_inventory:;@echo $(WITH_SDL_IMAGE) $(WITH_SDL_MIXER) $(WITH_SDL_TTF) $(WITH_OPENGL); echo $(PHP_VARIANT); echo $(PHP_CONFIGURE_DEPS); echo $(SHARED_LIBS); echo $(ARCHIVES); echo $(EXTRA_FLAGS)';

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
	const disabled = (await configure(['WITH_SDL=0'])).stdout;
	assert.match(disabled, /^0 0 0 0\n/);
	assert.doesNotMatch(disabled, /--wrap=SDL_/);
	assert.doesNotMatch(disabled, /sdl\/js\/library\.js/);
	for(const flag of ['1', 'dynamic'])
	{
		const {stdout} = await configure([`WITH_SDL=${flag}`]);
		assert.match(stdout, /^1 1 1 1\n_sdl\n/);
		assert.ok(stdout.includes('--js-library /src/packages/php-sdl-wasm/js/library.js'));
		assert.ok(stdout.includes('--js-library /src/packages/php-sdl-wasm/js/text-input.js'));
		assert.ok(stdout.includes('--js-library /src/packages/php-sdl-wasm/js/pointer-lock.js'));
		assert.ok(stdout.includes('-Wl,--wrap=SDL_SetRelativeMouseMode'));
		assert.ok(stdout.includes('packages/php-sdl-wasm/js/library.js'));
		for(const symbol of ['SDL_GL_DeleteContext', 'SDL_VideoQuit', 'SDL_VideoInit', 'SDL_FreeSurface', 'SDL_AudioQuit', 'SDL_AudioInit', 'SDL_StartTextInput', 'SDL_StopTextInput', 'SDL_SetTextInputRect'])
		{
			assert.ok(stdout.includes(`-Wl,--wrap=${symbol}`));
		}
		for(const name of ['sdl_image', 'sdl_mixer', 'sdl_ttf', 'opengl'])
		{
			assert.ok(stdout.includes(`ext/${name}/config.m4`));
		}
	}
	const {stdout} = await configure(['WITH_SDL=1', 'WITH_SDL_IMAGE=0', 'WITH_SDL_MIXER=0', 'WITH_SDL_TTF=0', 'WITH_OPENGL=0']);
	assert.match(stdout, /^0 0 0 0\n_sdl\n/);
	assert.doesNotMatch(stdout, /ext\/(sdl_image|sdl_mixer|sdl_ttf|opengl)\//);
	assert.ok(stdout.includes('-Wl,--wrap=SDL_GL_DeleteContext'));
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

test('SDL JavaScript invalidates every native link without invalidating PHP configure', async () => {
	const {stdout} = await run('make', [
		'--no-print-directory', '-pn', 'null'
		, 'ENV_FILE=.github/.env_8.4.static.ci', 'WITH_SDL=1'
	], {maxBuffer: 8 * 1024 * 1024});
	const rules = stdout.split('\n');
	const configure = rules.find(line => line.startsWith('third_party/php8.4-src/configured:'));
	assert.ok(configure);
	const links = rules.filter(line => /^packages\/php-(?:wasm|cgi-wasm|cli-wasm|dbg-wasm)\/php8\.4_sdl-.*\.(?:mjs|js): /.test(line));
	// Eight environment/format combinations in each of the four runtime packages.
	const targets = new Set(links.filter(line => line.includes('third_party/php8.4-src/configured')).map(line => line.split(':')[0]));
	assert.equal(targets.size, 32);
	for(const library of ['library.js', 'text-input.js', 'pointer-lock.js'])
	{
		const file = `packages/php-sdl-wasm/js/${library}`;
		assert.equal(configure.includes(file), false, `${file} must not trigger configure`);
		for(const target of targets)
		{
			assert.ok(links.some(line => line.startsWith(`${target}:`) && line.includes(file)), target);
		}
	}
});

test('native SDL patches invalidate extracted sources and their archives', async () => {
	const {stdout} = await run('make', [
		'--no-print-directory', '-pn', 'null'
		, 'ENV_FILE=.github/.env_8.4.static.ci', 'WITH_SDL=1'
	], {maxBuffer: 8 * 1024 * 1024});
	const rules = stdout.split('\n');
	for(const name of ['image', 'mixer'])
	{
		const configure = rules.find(line => line.startsWith(`third_party/SDL2_${name}-`) && line.includes('/configure:'));
		assert.ok(configure?.includes(`packages/php-sdl-wasm/patches/SDL2_${name}.patch`));
		const archive = rules.find(line => line.startsWith(`lib/lib/libSDL2_${name}.a:`));
		assert.ok(archive?.includes(configure.split(':')[0]));
	}
});

test('a fresh SDL web build does not require the standard Node runtime', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'php-sdl-wasm-stdlib-'));
	try
	{
		// Stand in for completed native work; leave the runtime output directory empty.
		for(const name of ['configured', 'runtime', 'assets'])
		{
			await writeFile(join(directory, name), '');
		}
		await run('make', [
			'--no-print-directory', 'ENV_FILE=.github/.env_8.4.dynamic.ci', 'WITH_SDL=1'
			, `PHP_DIST_DIR=${directory}/dist`
			, `PHP_CONFIGURE_DEPS=${directory}/configured`
			, `WEB_MJS=${directory}/runtime`
			, `WEB_MJS_ASSETS=${directory}/assets`
			, 'web-mjs'
		], {maxBuffer: 1024 * 1024});
	}
	finally
	{
		await rm(directory, {recursive: true, force: true});
	}
});

test('standard dynamic builds retain all stdlib generation targets', async () => {
	for(const version of ['8.2', '8.3', '8.4', '8.5'])
	{
		const {stdout} = await run('make', [
			'--no-print-directory'
			, `ENV_FILE=.github/.env_${version}.dynamic.ci`
			, 'WITH_SDL=0'
			, '--eval'
			, '__stdlib_inventory:;@echo $(STDLIB_NODE_TARGET) $(STDLIB_WEB_TARGET) $(STDLIB_WORKER_TARGET) $(STDLIB_WEBVIEW_TARGET)'
			, '__stdlib_inventory'
		]);
		assert.deepEqual(stdout.trim().split(/\s+/).map(path => path.split('/').pop()), [
			`${version}-node.mjs`
			, `${version}-web.mjs`
			, `${version}-worker.mjs`
			, `${version}-webview.mjs`
		]);
	}
});

test('the SDL runtime npm payload excludes native build inputs and the former shim', async () => {
	const {stdout} = await run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: new URL('../../packages/php-sdl-wasm', import.meta.url), maxBuffer: 1024 * 1024});
	const [{files}] = JSON.parse(stdout);
	const names = files.map(file => file.path);
	for(const name of [
		'index.mjs'
		, 'extensions.mak'
		, 'patches/sdl-events.patch'
		, 'patches/sdl-bindings.patch'
		, 'core/joystick.c'
		, 'core/glcontext.c'
		, 'core/glcontext.h'
		, 'core/php_sdl_context_hooks.c'
		, 'core/php_sdl_events.c'
		, 'core/php_sdl_render.c'
		, 'core/php_sdl_values.c'
		, 'core/pixels.c'
		, 'core/surface.c'
		, 'core/render.c'
		, 'core/rwops.c'
		, 'core/rwops.h'
		, 'core/mouse.c'
		, 'core/mouse.h'
		, 'js/library.js'
		, 'js/text-input.js'
		, 'js/pointer-lock.js'
		, 'core/php_sdl_text.c'
		, 'core/php_sdl_geometry.c'
		, 'core/php_sdl_geometry.stub.php'
		, 'core/php_sdl_geometry_arginfo.h'
		, 'core/php_sdl_extra.c'
		, 'core/php_sdl_extra.h'
		, 'core/php_sdl_extra_arginfo.h'
		, 'core/php_sdl_extra.stub.php'
		, 'ttf/php_ttf_extra.c'
		, 'ttf/sdl_ttf.c'
		, 'ttf/sdl_ttf_font.c'
		, 'ttf/sdl_ttf_font.h'
		, 'ttf/php_ttf_extra_arginfo.h'
		, 'ttf/php_ttf_extra.stub.php'
		, 'patches/sdl-asyncify.patch'
		, 'patches/sdl_image.patch'
		, 'patches/sdl_mixer.patch'
		, 'patches/sdl_ttf.patch'
		, 'patches/opengl.patch'
		, 'mixer/php_sdl_mixer_rw.h'
		, 'mixer/php_sdl_mixer_lifetime.h'
		, 'mixer/src/Mix_Chunk.c'
		, 'mixer/src/Mix_Chunk.h'
		, 'mixer/src/Mix_Music.c'
		, 'mixer/src/Mix_Music.h'
		, 'mixer/src/mixer.c'
		, 'mixer/src/music.c'
		, 'mixer/src/php_sdl_mixer.c'
		, 'mixer/src/effect_position.c'
		, 'mixer/src/effect_stereoreverse.c'
		, 'patches/SDL2_mixer.patch'
		, 'patches/SDL2_image.patch'
		, 'opengl/php_webgl.c'
		, 'opengl/php_webgl.h'
		, 'opengl/php_webgl_buffers.c'
		, 'opengl/php_webgl_targets.c'
		, 'opengl/php_webgl_state.c'
		, 'opengl/php_webgl_objects.c'
		, 'opengl/php_webgl_textures.c'
		, 'opengl/php_webgl_constants.h'
		, 'COVERAGE.md'
		, 'opengl/php_webgl_arginfo.h'
		, 'opengl/php_webgl.stub.php'
		, 'opengl/LICENSE'
	]) {
		assert.ok(!names.includes(name), name);
	}
	for(const name of ['public.d.ts', 'PhpSdl.d.mts', 'PhpWebBase.d.mts', 'LICENSE', 'NOTICE', 'README.md']) assert.ok(names.includes(name), name);
});
