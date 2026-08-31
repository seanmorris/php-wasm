import assert from 'node:assert/strict';
import test from 'node:test';

import { requestWebLock } from '../source/webTransactions.mjs';

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
