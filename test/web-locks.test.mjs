import assert from 'node:assert/strict';
import test from 'node:test';

import {
	commitTransaction
	, requestWebLock
	, startTransaction
} from '../source/webTransactions.mjs';

const createRuntime = ({startError = null, commitError = null} = {}) => {
	const syncCalls = [];
	const runtime = {
		persist: true
		, FS: {
			syncfs: (populate, callback) => {
				syncCalls.push(populate);
				queueMicrotask(() => callback(populate ? startError : commitError));
			}
		}
	};

	return {runtime, syncCalls};
};

test('requestWebLock delegates to the browser Web Locks API', async () => {
	const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	const calls = [];

	Object.defineProperty(globalThis, 'navigator', {
		configurable: true
		, value: {
			locks: {
				request: async (name, callback) => {
					calls.push(name);
					return callback();
				}
			}
		}
	});

	try
	{
		assert.equal(await requestWebLock('native-lock', () => 'result'), 'result');
		assert.deepEqual(calls, ['native-lock']);
	}
	finally
	{
		if(originalNavigator)
		{
			Object.defineProperty(globalThis, 'navigator', originalNavigator);
		}
		else
		{
			delete globalThis.navigator;
		}
	}
});

test('requestWebLock serializes callbacks when Web Locks are unavailable', async () => {
	const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	const events = [];
	let releaseFirst;
	let signalFirstStarted;
	const firstStarted = new Promise(resolve => signalFirstStarted = resolve);

	Object.defineProperty(globalThis, 'navigator', {
		configurable: true
		, value: {}
	});

	try
	{
		const first = requestWebLock('fallback-lock', async () => {
			events.push('first:start');
			signalFirstStarted();
			await new Promise(resolve => releaseFirst = resolve);
			events.push('first:end');
			return 'first';
		});

		const second = requestWebLock('fallback-lock', async () => {
			events.push('second:start');
			events.push('second:end');
			return 'second';
		});

		await firstStarted;
		assert.deepEqual(events, ['first:start']);
		releaseFirst();

		assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
		assert.deepEqual(events, [
			'first:start'
			, 'first:end'
			, 'second:start'
			, 'second:end'
		]);
	}
	finally
	{
		if(originalNavigator)
		{
			Object.defineProperty(globalThis, 'navigator', originalNavigator);
		}
		else
		{
			delete globalThis.navigator;
		}
	}
});

test('commitTransaction uses the runtime captured by startTransaction', async () => {
	const original = createRuntime();
	const replacement = createRuntime();
	const wrapper = {
		binary: Promise.resolve(original.runtime)
		, transactionStarted: false
	};

	await startTransaction(wrapper);
	wrapper.binary = Promise.resolve(replacement.runtime);
	await commitTransaction(wrapper);

	assert.deepEqual(original.syncCalls, [true, false]);
	assert.deepEqual(replacement.syncCalls, []);
	assert.equal(wrapper.transactionStarted, false);
	assert.equal(wrapper.transactionRuntime, null);
});

test('startTransaction clears failed state so a later transaction can retry', async () => {
	const startError = new Error('populate failed');
	const failed = createRuntime({startError});
	const replacement = createRuntime();
	const wrapper = {
		binary: Promise.resolve(failed.runtime)
		, transactionStarted: false
	};

	await assert.rejects(startTransaction(wrapper), startError);
	assert.equal(wrapper.transactionStarted, false);
	assert.equal(wrapper.transactionRuntime, null);

	wrapper.binary = Promise.resolve(replacement.runtime);
	await startTransaction(wrapper);
	await commitTransaction(wrapper);

	assert.deepEqual(failed.syncCalls, [true]);
	assert.deepEqual(replacement.syncCalls, [true, false]);
});

test('commitTransaction clears failed state so a later transaction can retry', async () => {
	const commitError = new Error('commit failed');
	const failed = createRuntime({commitError});
	const replacement = createRuntime();
	const wrapper = {
		binary: Promise.resolve(failed.runtime)
		, transactionStarted: false
	};

	await startTransaction(wrapper);
	await assert.rejects(commitTransaction(wrapper), commitError);
	assert.equal(wrapper.transactionStarted, false);
	assert.equal(wrapper.transactionRuntime, null);

	wrapper.binary = Promise.resolve(replacement.runtime);
	await startTransaction(wrapper);
	await commitTransaction(wrapper);

	assert.deepEqual(failed.syncCalls, [true, false]);
	assert.deepEqual(replacement.syncCalls, [true, false]);
});
