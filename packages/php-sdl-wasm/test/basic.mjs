import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PhpSdl} from '../../../source/PhpSdl.mjs';

const fakeRuntime = () => ({
	FS: {analyzePath: () => ({exists: true}), writeFile() {}}
	, ccall: () => 0
});

test('SDL accepts synchronous, asynchronous and namespace factories', async () => {
	for(const runtime of [fakeRuntime, async () => fakeRuntime(), {default: fakeRuntime}])
	{
		const php = new PhpSdl({runtime, version: '8.4', persist: false});
		const binary = await php.binary;
		assert.equal(typeof binary.ccall, 'function');
		assert.equal(php.phpVersion, '8.4');
	}
});

test('SDL requires a supported version and matching native factory', () => {
	for(const args of [undefined, {}, {version: '8.4'}, {version: '9.0', runtime: fakeRuntime}])
	{
		assert.throws(() => new PhpSdl(args), TypeError);
	}
});

test('legacy variants produce a migration error', () => {
	assert.throws(() => new PhpSdl({runtime: fakeRuntime, version: '8.4', variant: '_sdl'}), /Install php-sdl-wasm and import PhpSdl/);
});
