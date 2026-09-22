import assert from 'node:assert/strict';
import test from 'node:test';

import {PhpWeb} from '../source/PhpWeb.mjs';
import {PhpWorker} from '../source/PhpWorker.mjs';
import {PhpWebview} from '../source/PhpWebview.mjs';
import {PhpDbgWeb} from '../source/PhpDbgWeb.mjs';
import {requestWebLock} from '../source/webTransactions.mjs';

/**
 * Exercise wrapper methods with an initialized runtime, without loading Wasm.
 * @param {Function} Wrapper Browser wrapper constructor.
 * @returns {object} Wrapper and recorded filesystem synchronization calls.
 */
const createWrapper = Wrapper => {
	const sync = [];
	const wrapper = Object.assign(Object.create(Wrapper.prototype), {
		queue: [], autoTransaction: false, shared: {}, phpArgs: {persist: true}
		, binary: Promise.resolve({
			onRefresh: [], ccall: async () => 0
			, FS: {syncfs: (populate, done) => { sync.push(populate); done(); }}
		})
	});
	return {wrapper, sync};
};

for(const Wrapper of [PhpWeb, PhpWorker, PhpWebview, PhpDbgWeb])
{
	test(`${Wrapper.name} queues operations without navigator.locks`, async () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
		Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
		try
		{
			const {wrapper} = createWrapper(Wrapper);
			const events = [];
			const first = wrapper._enqueue(async () => { events.push(1); return 'first'; });
			const second = wrapper._enqueue(async () => { events.push(2); return 'second'; });
			assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
			await requestWebLock('php-wasm-fs-lock', () => {});
			assert.deepEqual(events, [1, 2]);
			assert.equal(wrapper.queue.length, 0);
		}
		finally
		{
			if(original)
			{ Object.defineProperty(globalThis, 'navigator', original); }
			else
			{ delete globalThis.navigator; }
		}
	});

	if(Wrapper === PhpDbgWeb)
	{ continue; }
	test(`${Wrapper.name} refreshes and syncs without navigator.locks`, async () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
		Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
		try
		{
			const {wrapper, sync} = createWrapper(Wrapper);
			const php = await wrapper.binary;
			let completeSync;
			php.FS.syncfs = (populate, done) => {
				sync.push(populate);
				completeSync = done;
			};
			let refreshed = false;
			const refresh = wrapper.refresh().then(() => refreshed = true);
			await new Promise(resolve => setImmediate(resolve));
			assert.deepEqual(sync, [true]);
			assert.equal(refreshed, false);
			completeSync();
			await refresh;
			assert.equal(refreshed, true);
		}
		finally
		{
			if(original)
			{ Object.defineProperty(globalThis, 'navigator', original); }
			else
			{ delete globalThis.navigator; }
		}
	});
}
