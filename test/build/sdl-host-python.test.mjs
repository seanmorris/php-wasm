import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import makeEnvironment from '../../bin/make-environment.cjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('SDL archive lookup runs inside the builder when the host has no Python', t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'php-sdl-host-python-'));
	t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
	const pkg = path.join(directory, 'packages/php-sdl-wasm');
	const port = path.join(pkg, 'ports/sdl2-rumble.py');
	const patch = path.join(pkg, 'patches/SDL2-rumble.patch');
	const sdk = path.join(directory, 'emsdk/upstream/emscripten/cache/sysroot');
	const archiveDir = path.join(sdk, 'lib/wasm32-emscripten/lto-pic');
	const fakeDocker = path.join(directory, 'docker-run.cjs');
	const hostPath = path.join(directory, 'host-bin');
	const node = execFileSync('node', ['-p', 'process.execPath'], {encoding: 'utf8'}).trim();
	for(const dir of [path.dirname(port), path.dirname(patch), archiveDir, path.join(sdk, 'include/SDL2'), hostPath])
		fs.mkdirSync(dir, {recursive: true});
	fs.copyFileSync(path.join(root, 'packages/php-sdl-wasm/ports/sdl2-rumble.py'), port);
	fs.copyFileSync(path.join(root, 'packages/php-sdl-wasm/patches/SDL2-rumble.patch'), patch);
	fs.writeFileSync(path.join(pkg, 'extensions.mak'), '');
	const digest = createHash('sha256').update(fs.readFileSync(port)).update(fs.readFileSync(patch)).digest('hex').slice(0, 16);
	fs.writeFileSync(path.join(archiveDir, `libSDL2-rumble-${digest}.a`), 'builder archive');
	// The outer Make process sees no Python; this shim gives only builder commands the normal PATH.
	fs.writeFileSync(fakeDocker, `
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2).map(arg => arg.replaceAll('/src/', ${JSON.stringify(`${directory}/`)}).replaceAll('/emsdk/', ${JSON.stringify(`${directory}/emsdk/`)}));
if(args[0] === 'retry-embuilder') process.exit(0);
const result = spawnSync(args[0], args.slice(1), {stdio: 'inherit', env: {...process.env, PATH: process.env.TEST_BUILDER_PATH}});
process.exit(result.status ?? 1);
`);
	execFileSync('/usr/bin/make', [
		'--no-print-directory'
		, '-f'
		, path.join(root, 'packages/php-sdl-wasm/static.mak')
		, 'PHP_VERSION=8.4'
		, `DOCKER_RUN=${node} ${fakeDocker}`
		, 'lib/lib/libSDL2.a'
	], {
		cwd: directory
		, env: {...makeEnvironment.independentMakeEnvironment(), PATH: hostPath, TEST_BUILDER_PATH: process.env.PATH}
		, stdio: 'pipe'
	});
	assert.equal(fs.readFileSync(path.join(directory, 'lib/lib/libSDL2.a'), 'utf8'), 'builder archive');
});
