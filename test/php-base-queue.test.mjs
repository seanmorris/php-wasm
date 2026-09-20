import assert from 'node:assert/strict';
import test from 'node:test';

import { PhpBase } from '../source/PhpBase.mjs';

const deferred = () => {
	let resolve;
	const promise = new Promise(accept => resolve = accept);
	return {promise, resolve};
};

const createPhp = (args = {}, ccall = () => 0) => new PhpBase(Promise.resolve(() => ({
	FS: {analyzePath: () => ({exists: true}), writeFile() {}}
	, ccall
})), args);

test('PhpBase serializes concurrent run/exec calls and awaits async run before flushing', async () => {
	const started = deferred();
	const release = deferred();
	const events = [];
	const php = createPhp({}, async (name, result, types, values, options) => {
		assert.deepEqual(options, {async: true});
		if(name !== 'pib_run' && name !== 'pib_exec') return 0;
		events.push(`${name}:start`);
		if(name === 'pib_run')
		{
			assert.equal(values.length, 1);
			assert.match(values[0], /first\(\);$/);
			started.resolve();
			await release.promise;
		}
		events.push(`${name}:end`);
		return 42;
	});
	php.flush = () => events.push('flush');

	const first = php.run('<?php first();');
	const second = php.exec('second();');
	await started.promise;
	assert.deepEqual(events, ['pib_run:start']);
	release.resolve();
	assert.deepEqual(await Promise.all([first, second]), [42, 42]);
	assert.deepEqual(events, ['pib_run:start', 'pib_run:end', 'flush', 'pib_exec:start', 'pib_exec:end', 'flush']);
	assert.equal(php._queueActive, false);
});

test('PhpBase awaits transaction acquisition and commit before settling each item', async () => {
	const start = deferred();
	const commit = deferred();
	const committing = deferred();
	const events = [];
	const php = createPhp();
	php.startTransaction = async () => {
		events.push('start');
		await start.promise;
	};
	php.commitTransaction = async () => {
		events.push('commit');
		committing.resolve();
		await commit.promise;
	};
	const operation = php._enqueue(async () => {
		events.push('callback');
		return 42;
	});
	let settled = false;
	operation.then(() => settled = true);
	await Promise.resolve();
	assert.deepEqual(events, ['start']);
	start.resolve();
	await committing.promise;
	assert.deepEqual(events, ['start', 'callback', 'commit']);
	assert.equal(settled, false);
	commit.resolve();
	assert.equal(await operation, 42);
});

test('PhpBase keeps readOnly metadata on each queued transaction', async () => {
	const php = createPhp();
	const events = [];
	php.startTransaction = async () => events.push('start');
	php.commitTransaction = async readOnly => events.push(readOnly);
	await Promise.all([
		php._enqueue(async () => 'write', [], false)
		, php._enqueue(async () => 'read', [], true)
		, php._enqueue(async () => 'write again', [], false)
	]);
	assert.deepEqual(events, ['start', false, 'start', true, 'start', false]);
});

test('PhpBase recovers after synchronous throws and rejected callbacks', async () => {
	const php = createPhp();
	const failure = new Error('callback failed');
	let commits = 0;
	php.commitTransaction = async () => commits++;
	const results = await Promise.allSettled([
		php._enqueue(() => { throw failure; })
		, php._enqueue(() => Promise.reject(undefined))
		, php._enqueue(() => 42)
	]);
	assert.deepEqual(results, [
		{status: 'rejected', reason: failure}
		, {status: 'rejected', reason: undefined}
		, {status: 'fulfilled', value: 42}
	]);
	assert.equal(commits, 3);
	assert.equal(php.queue.length, 0);
	assert.equal(await php._enqueue(async () => 'later'), 'later');
});

test('PhpBase rejects failed acquisition/commit without stranding later work', async () => {
	const php = createPhp();
	const startFailure = new Error('start failed');
	const commitFailure = new Error('commit failed');
	let starts = 0;
	let commits = 0;
	let callbacks = 0;
	php.startTransaction = async () => {
		if(++starts === 1) throw startFailure;
	};
	php.commitTransaction = async () => {
		if(++commits === 1) throw commitFailure;
	};
	const callback = async () => ++callbacks;
	assert.deepEqual(await Promise.allSettled([
		php._enqueue(callback), php._enqueue(callback), php._enqueue(callback)
	]), [
		{status: 'rejected', reason: startFailure}
		, {status: 'rejected', reason: commitFailure}
		, {status: 'fulfilled', value: 2}
	]);
	assert.equal(starts, 3);
	assert.equal(commits, 2);
	assert.equal(php._queueActive, false);
});

test('PhpBase preserves callback and commit errors when both fail', async () => {
	const php = createPhp();
	const callbackFailure = new Error('callback');
	const commitFailure = new Error('commit');
	php.commitTransaction = async () => { throw commitFailure; };
	await assert.rejects(php._enqueue(async () => { throw callbackFailure; }), error => {
		assert.ok(error instanceof AggregateError);
		assert.deepEqual(error.errors, [callbackFailure, commitFailure]);
		return true;
	});
});

test('PhpBase leaves manually managed transactions untouched', async () => {
	const php = createPhp({autoTransaction: false});
	php.startTransaction = () => { throw new Error('unexpected start'); };
	php.commitTransaction = () => { throw new Error('unexpected commit'); };
	assert.equal(await php._enqueue(async () => 42), 42);
});

test('PhpBase supports both class and ordinary factories and retains global defaults', async () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'phpSettings');
	const captured = [];
	globalThis.phpSettings = {debug: true, ENV: {GLOBAL_SETTING: 'yes'}};
	const factory = args => {
		captured.push(args);
		return {FS: {analyzePath: () => ({exists: true}), writeFile() {}}, ccall: () => 0};
	};
	try
	{
		class Runtime
		{
			constructor(args)
{ return factory(args); }
		}
		await new PhpBase(Promise.resolve({default: Runtime})).binary;
		await new PhpBase(Promise.resolve(factory), {debug: false}).binary;
		assert.equal(captured[0].debug, true);
		assert.equal(captured[1].debug, false);
	}
	finally
	{
		if(descriptor) Object.defineProperty(globalThis, 'phpSettings', descriptor);
		else delete globalThis.phpSettings;
	}
});
