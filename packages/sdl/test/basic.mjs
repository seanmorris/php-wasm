import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import sdl from 'php-wasm-sdl';

test('SDL compatibility shim resolves no runtime shared libraries.', () => {
	const libs = sdl.getLibs({phpVersion: '8.4'});
	assert.deepEqual(libs, []);
});

test('SDL compatibility shim ignores version selection.', () => {
	for(const version of ['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'])
	{
		const libs = sdl.getLibs({phpVersion: version});
		assert.deepEqual(libs, []);
	}
});

test('SDL package module loader stays shape-compatible.', async () => {
	const module = await import('php-wasm-sdl');
	const libs = module.default.getLibs({phpVersion: '8.4'});
	assert.deepEqual(libs, []);
});
