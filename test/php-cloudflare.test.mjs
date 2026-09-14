import assert from 'node:assert/strict';
import test from 'node:test';

import { PhpCloudflare } from '../source/PhpCloudflare.mjs';

// An empty module is enough to verify the instantiation contract without PHP.
const wasmModule = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));

const fakeRuntime = () => ({
	FS: {analyzePath: () => ({exists: true}), writeFile() {}}
	, ccall: () => 0
});

const configureGlobal = (name, value) => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
	Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
	return () => {
		if(descriptor) Object.defineProperty(globalThis, name, descriptor);
		else delete globalThis[name];
	};
};

test('PhpCloudflare instantiates precompiled Wasm and returns the receiver exports', async () => {
	const wrappedExports = {wrapped: true};
	let captured;
	const runtime = args => {
		captured = args;
		const received = args.instantiateWasm({}, (instance, module) => {
			assert.ok(instance instanceof WebAssembly.Instance);
			assert.equal(module, wasmModule);
			assert.notEqual(instance.exports, wrappedExports);
			return wrappedExports;
		});
		assert.equal(received, wrappedExports);
		return fakeRuntime();
	};
	const forbidden = () => { throw new Error('Unexpected dynamic code generation or browser lock'); };
	const restoreNavigator = configureGlobal('navigator', {locks: {request: forbidden}});
	const restoreFetch = configureGlobal('fetch', forbidden);
	const restoreEval = configureGlobal('eval', forbidden);
	const restoreFunction = configureGlobal('Function', new Proxy(Function, {construct: forbidden, apply: forbidden}));
	const originalModule = WebAssembly.Module;
	WebAssembly.Module = new Proxy(originalModule, {construct: forbidden});
	try
	{
		const php = new PhpCloudflare({runtime, wasmModule, version: '8.3'});
		await php.binary;
		assert.equal(await php.run('<?php echo 42;'), 0);
		assert.equal(await php.exec('return 42;'), 0);
		assert.equal(captured.ENV.PHP_VERSION, '8.3');
		assert.equal(captured.persist, false);
	}
	finally
	{
		WebAssembly.Module = originalModule;
		restoreFunction();
		restoreEval();
		restoreFetch();
		restoreNavigator();
	}
});

test('PhpCloudflare accepts a class factory and an ESM namespace', async () => {
	class Runtime
	{
		constructor()
{ return fakeRuntime(); }
	}
	for(const runtime of [Runtime, {default: Runtime}, fakeRuntime, {default: fakeRuntime}])
	{
		const php = new PhpCloudflare({runtime, wasmModule, version: '8.3'});
		await php.binary;
	}
});

test('PhpCloudflare rejects byte buffers and missing factories before initialization', () => {
	assert.throws(() => new PhpCloudflare({runtime: fakeRuntime, wasmModule: new Uint8Array(), version: '8.3'}), /precompiled WebAssembly.Module/);
	assert.throws(() => new PhpCloudflare({wasmModule, version: '8.3'}), /runtime factory/);
});

test('PhpCloudflare rejects unsupported options even when inherited through global settings', async () => {
	const cases = [
		['persist', {}]
		, ['persist', true]
		, ['sharedLibs', []]
		, ['dynamicLibs', []]
		, ['dynamicLibraries', []]
		, ['instantiateWasm', () => {}]
		, ['wasmBinary', new Uint8Array()]
	];
	for(const [name, value] of cases)
	{
		assert.throws(() => new PhpCloudflare({runtime: fakeRuntime, wasmModule, version: '8.3', [name]: value}), TypeError);
		const restore = configureGlobal('phpSettings', {[name]: value});
		try
		{
			// Explicit options must not hide an unsafe global setting.
			assert.throws(() => new PhpCloudflare({runtime: fakeRuntime, wasmModule, version: '8.3', [name]: undefined}), TypeError);
		}
		finally
{ restore(); }
	}
});

test('PhpCloudflare keeps bindings, shared maps and identity instance-local', async () => {
	const globalBinding = {};
	const restore = configureGlobal('phpSettings', {
		shared: {leaked: true}, cfd1: {leaked: globalBinding}
		, version: '8.0', variant: '_sdl', debug: true
	});
	const captured = [];
	const runtime = args => { captured.push(args); return fakeRuntime(); };
	const binding = {};
	const shared = {local: true};
	const cfd1 = {mainDb: binding};
	try
	{
		const first = new PhpCloudflare({runtime, wasmModule, version: '8.3', shared, cfd1});
		const second = new PhpCloudflare({runtime, wasmModule, version: '8.3', shared, cfd1});
		await Promise.all([first.binary, second.binary]);
		first.shared.onlyFirst = true;
		captured[0].cfd1.onlyFirst = {};
		assert.notEqual(first.shared, second.shared);
		assert.deepEqual(second.shared, {local: true});
		assert.deepEqual(shared, {local: true});
		assert.deepEqual(cfd1, {mainDb: binding});
		assert.deepEqual(captured[1].cfd1, {mainDb: binding});
		assert.equal(captured[0].cfd1.mainDb, binding);
		assert.equal(captured[0].version, '8.3');
		assert.equal(captured[0].variant, '');
		assert.equal(captured[0].debug, true);
		const third = new PhpCloudflare({runtime, wasmModule, version: '8.3'});
		await third.binary;
		assert.deepEqual(third.shared, {});
		assert.deepEqual(captured[2].cfd1, {});
	}
	finally
{ restore(); }
});
