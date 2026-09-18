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
	, startTransaction: async () => {}, commitTransaction: async () => {}
});

test('browser CGI acknowledgments wait for persistence and later work stays serialized', async () => {
	const cgi = create();
	const committing = deferred();
	const release = deferred();
	const events = [];
	cgi.commitTransaction = async () => {committing.resolve(); await release.promise; events.push('committed');};
	const first = cgi._enqueue(() => events.push('first')).then(() => events.push('acknowledged'));
	const second = cgi._enqueue(() => events.push('second'));
	await committing.promise;
	assert.deepEqual(events, ['first']);
	release.resolve();
	await Promise.all([first, second]);
	assert.ok(events.indexOf('committed') < events.indexOf('acknowledged'));
	assert.ok(events.indexOf('committed') < events.indexOf('second'));
});

test('browser CGI recovers from initialization, callback and commit failures', async () => {
	const cgi = create();
	let starts = 0, commits = 0;
	cgi.startTransaction = async () => {if(++starts === 1) throw new Error('start');};
	cgi.commitTransaction = async () => {if(++commits === 1) throw new Error('commit');};
	const results = await Promise.allSettled([
		cgi._enqueue(() => 1), cgi._enqueue(() => {throw new Error('callback');}), cgi._enqueue(() => 3)
	]);
	assert.equal(results[0].reason.message, 'start');
	assert.deepEqual(results[1].reason.errors.map(error => error.message), ['callback', 'commit']);
	assert.equal(results[2].value, 3);
	assert.equal(await cgi._enqueue(() => 4), 4);
});

test('browser CGI retains readOnly metadata and manual transaction ownership', async () => {
	const cgi = create();
	const commits = [];
	cgi.commitTransaction = async readOnly => commits.push(readOnly);
	await Promise.all([cgi._enqueue(() => 1, [], true), cgi._enqueue(() => 2, [], false)]);
	assert.deepEqual(commits, [true, false]);
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
