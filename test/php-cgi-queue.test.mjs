import assert from 'node:assert/strict';
import test from 'node:test';
import {PhpCgiWebBase} from '../source/PhpCgiWebBase.mjs';

const deferred = () => {
	let resolve;
	const promise = new Promise(accept => resolve = accept);
	return {promise, resolve};
};

const create = () => Object.assign(Object.create(PhpCgiWebBase.prototype), {
	binary: Promise.resolve({}), autoTransaction: true
	, _filesystemQueue: [], _filesystemQueueActive: false
	, startTransaction: async () => {}, commitTransaction: async () => {}
});

test('browser CGI batches acknowledgments after persistence and excludes work arriving during commit', async () => {
	const cgi = create();
	const committing = deferred();
	const release = deferred();
	const events = [];
	let commits = 0;
	cgi.commitTransaction = async () => {
		if(++commits === 1)
		{ committing.resolve(); await release.promise; }
		events.push('committed');
	};
	const first = cgi._enqueue(() => events.push('first')).then(() => events.push('acknowledged'));
	const second = cgi._enqueue(() => events.push('second'));
	await committing.promise;
	assert.deepEqual(events, ['first', 'second']);
	const third = cgi._enqueue(() => events.push('third'));
	await Promise.resolve();
	assert.deepEqual(events, ['first', 'second']);
	release.resolve();
	await Promise.all([first, second, third]);
	assert.ok(events.indexOf('committed') < events.indexOf('acknowledged'));
	assert.ok(events.indexOf('committed') < events.indexOf('third'));
	assert.equal(commits, 2);
});

test('browser CGI waits 25 ms after the queue becomes idle and accepts work during that wait', async t => {
	t.mock.timers.enable({apis: ['setTimeout', 'Date']});
	const cgi = create();
	const events = [];
	let commits = 0;
	cgi.commitTransaction = async () => commits++;
	const tick = async () => {
		t.mock.timers.tick(5);
		await new Promise(resolve => setImmediate(resolve));
	};
	const first = cgi._enqueue(() => events.push('first'));
	await new Promise(resolve => setImmediate(resolve));
	await tick();
	await tick();
	assert.equal(commits, 0);
	const second = cgi._enqueue(() => events.push('second'));
	await new Promise(resolve => setImmediate(resolve));
	await tick();
	assert.deepEqual(events, ['first', 'second']);
	for(let index = 0; index < 4; index++) await tick();
	assert.equal(commits, 0);
	await tick();
	await Promise.all([first, second]);
	assert.equal(commits, 1);
});

test('browser CGI recovers from initialization, callback and commit failures', async () => {
	const cgi = create();
	let starts = 0, commits = 0;
	cgi.startTransaction = async () => {if(++starts === 1) throw new Error('start');};
	cgi.commitTransaction = async () => {if(++commits === 1) throw new Error('commit');};
	const results = await Promise.allSettled([
		cgi._enqueue(() => 1)
		, cgi._enqueue(() => {throw new Error('callback');})
		, cgi._enqueue(() => 3)
	]);
	assert.equal(results[0].reason.message, 'start');
	assert.deepEqual(results[1].reason.errors.map(error => error.message), ['callback', 'commit']);
	assert.equal(results[2].reason.message, 'commit');
	assert.equal(await cgi._enqueue(() => 4), 4);
});

test('browser CGI retains readOnly metadata and manual transaction ownership', async () => {
	const cgi = create();
	const commits = [];
	cgi.commitTransaction = async readOnly => commits.push(readOnly);
	await Promise.all([cgi._enqueue(() => 1, [], true), cgi._enqueue(() => 2, [], false)]);
	assert.deepEqual(commits, [false]);
	await Promise.all([cgi._enqueue(() => 1, [], true), cgi._enqueue(() => 2, [], true)]);
	assert.deepEqual(commits, [false, true]);
	cgi.autoTransaction = false;
	cgi.startTransaction = () => {throw new Error('manual start');};
	cgi.commitTransaction = () => {throw new Error('manual commit');};
	assert.equal(await cgi._enqueue(() => 3), 3);
});

test('browser CGI rejects failed runtime initialization and still accepts a replacement', async () => {
	const cgi = create();
	cgi.binary = Promise.reject(new Error('runtime'));
	await assert.rejects(cgi._enqueue(() => 1), /runtime/);
	cgi.binary = Promise.resolve({});
	assert.equal(await cgi._enqueue(() => 2), 2);
});

test('browser CGI preserves individual callback failures and commits partial writes', async () => {
	const cgi = create();
	const commits = [];
	cgi.commitTransaction = async readOnly => commits.push(readOnly);
	const failure = new Error('callback');
	const results = await Promise.allSettled([
		cgi._enqueue(() => {throw failure;})
		, cgi._enqueue(() => Promise.reject(undefined))
		, cgi._enqueue(() => 3, [], true)
	]);
	assert.deepEqual(results, [
		{status: 'rejected', reason: failure}
		, {status: 'rejected', reason: undefined}
		, {status: 'fulfilled', value: 3}
	]);
	assert.deepEqual(commits, [false]);
});

test('browser CGI bounds batches so a continuous queue cannot defer every acknowledgment', async () => {
	const cgi = create();
	let executed = 0;
	const commits = [];
	cgi.commitTransaction = async () => commits.push(executed);
	await Promise.all(Array.from({length: 70}, () => cgi._enqueue(() => ++executed)));
	assert.deepEqual(commits, [64, 70]);
});

test('browser CGI commits after its processing window even below the operation limit', async t => {
	t.mock.timers.enable({apis: ['setTimeout', 'Date']});
	const cgi = create();
	let executed = 0;
	const commits = [];
	cgi.commitTransaction = async () => commits.push(executed);
	await Promise.all(Array.from({length: 3}, () => cgi._enqueue(() => {
		t.mock.timers.tick(250);
		return ++executed;
	})));
	assert.deepEqual(commits, [1, 2, 3]);
});

test('browser CGI separates operations queued with different automatic transaction modes', async () => {
	const cgi = create();
	const started = deferred();
	const release = deferred();
	const events = [];
	cgi.startTransaction = async () => events.push('start');
	cgi.commitTransaction = async () => events.push('commit');
	const first = cgi._enqueue(async () => {started.resolve(); await release.promise; events.push('automatic');});
	await started.promise;
	cgi.autoTransaction = false;
	const manual = cgi._enqueue(() => events.push('manual'));
	release.resolve();
	await Promise.all([first, manual]);
	assert.deepEqual(events, ['start', 'automatic', 'commit', 'manual']);
});

test('browser CGI rejects queued callbacks for a replaced runtime without stranding later work', async () => {
	const cgi = create();
	const started = deferred();
	const release = deferred();
	const first = cgi._enqueue(async () => {started.resolve(); await release.promise; return 1;});
	const stale = cgi._enqueue(() => {throw new Error('stale callback ran');});
	const rejected = assert.rejects(stale, /runtime changed before the filesystem operation started/);
	await started.promise;
	cgi.binary = Promise.resolve({});
	const replacement = cgi._enqueue(() => 3);
	release.resolve();
	assert.deepEqual(await Promise.all([first, replacement]), [1, 3]);
	await rejected;
});
