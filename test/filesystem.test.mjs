import assert from 'node:assert/strict';
import test from 'node:test';
import { PhpBase } from '../source/PhpBase.mjs';
import { PhpCgiWebBase } from '../source/PhpCgiWebBase.mjs';

/**
 * Creates a wrapper with instrumented storage and the real queue/transaction code.
 * @param {string[]} names Directory entry names.
 * @param {typeof PhpBase|typeof PhpCgiWebBase} Wrapper Runtime wrapper constructor.
 * @returns {object} Wrapper, filesystem stubs and recorded operations.
 */
const createFilesystem = (names = ['.', '..', 'folder', 'café.php', 'folder-link'], Wrapper = PhpCgiWebBase) => {
	const events = [];
	const FS = {
		syncfs: (populate, callback) => {
			events.push(populate ? 'populate' : 'flush');
			queueMicrotask(callback);
		}
		, readdir: path => {
			events.push(`readdir:${path}`);
			return names;
		}
		, stat: path => {
			events.push(`stat:${path}`);
			return {mode: /(?:\.|folder|folder-link)$/.test(path) ? 0o40755 : 0o100644};
		}
		, isDir: mode => (mode & 0o170000) === 0o40000
		, analyzePath: () => ({exists: false})
		, readFile: () => new Uint8Array([65])
		, writeFile: () => events.push('write')
	};
	const php = Object.assign(Object.create(Wrapper.prototype), {
		binary: Promise.resolve({FS, persist: true})
		, autoTransaction: true
		, queue: []
		, extraActions: {}
	});
	return {php, FS, events, names};
};

for(const Wrapper of [PhpBase, PhpCgiWebBase])
{
	test(`${Wrapper.name} keeps legacy names and resolves typed entries in filesystem order`, async () => {
		const {php, events, names} = createFilesystem(undefined, Wrapper);
		assert.deepEqual(await php.readdir('/persist'), names);
		assert.deepEqual(await php.readdir('/persist', {withFileTypes: false}), names);
		assert.equal(events.some(event => event.startsWith('stat:')), false);

		const entries = await php.readdir('/persist/', {withFileTypes: true});
		assert.deepEqual(entries, names.map(name => ({name, isFolder: name !== 'café.php'})));
		assert.deepEqual(JSON.parse(JSON.stringify(entries)), entries);
		assert.deepEqual(events.filter(event => event.startsWith('stat:')), names.map(name => `stat:/persist/${name}`));
	});
}

for(const count of [100, 1000])
{
	test(`CGI lists ${count} entries with one populate and no flush`, async () => {
		const names = Array.from({length: count}, (_, index) => `file-${index}.php`);
		const {php, events} = createFilesystem(names);
		let reply;
		let lifetime;
		const work = php.handleMessageEvent({
			data: {action: 'readdir', params: ['/persist', {withFileTypes: true}], token: 'listing'}
			, source: {postMessage: message => reply = structuredClone(message)}
			, waitUntil: promise => lifetime = promise
		});
		assert.equal(lifetime, work);
		await work;
		assert.equal(reply.re, 'listing');
		assert.equal(reply.error, undefined);
		assert.deepEqual(reply.result, names.map(name => ({name, isFolder: false})));
		assert.equal(events.filter(event => event === 'populate').length, 1);
		assert.equal(events.filter(event => event === 'flush').length, 0);
		assert.equal(events.filter(event => event.startsWith('readdir:')).length, 1);
		assert.equal(php.transactionStarted, false);
	});
}

test('every public CGI read refreshes storage without flushing', async () => {
	const {php, events} = createFilesystem();
	await php.analyzePath('/persist');
	await php.readdir('/persist');
	await php.readFile('/persist/file');
	await php.stat('/persist/file');
	assert.equal(events.filter(event => event === 'populate').length, 4);
	assert.equal(events.filter(event => event === 'flush').length, 0);
});

test('CGI reads wait for hydration, and later reads wait for writes to persist', async () => {
	const {php, FS, events} = createFilesystem();
	let release;
	let started;
	const hydrating = new Promise(accept => started = accept);
	FS.syncfs = (populate, callback) => {
		events.push(populate ? 'populate' : 'flush');
		release = callback;
		started();
	};
	const listing = php.readdir('/persist', {withFileTypes: true});
	await hydrating;
	assert.deepEqual(events, ['populate']);
	release();
	await listing;

	const flushing = new Promise(accept => started = accept);
	FS.syncfs = (populate, callback) => {
		events.push(populate ? 'populate' : 'flush');
		if(populate) queueMicrotask(callback);
		else
		{
			release = callback;
			started();
		}
	};
	events.length = 0;
	const write = php.writeFile('/persist/new.php', 'saved').then(() => events.push('acknowledged'));
	const read = php.readdir('/persist');
	await flushing;
	assert.deepEqual(events, ['populate', 'write', 'flush']);
	release();
	await Promise.all([write, read]);
	assert.ok(events.indexOf('acknowledged') > events.indexOf('flush'));
	assert.equal(events.filter(event => event === 'populate').length, 2);
	assert.equal(events.filter(event => event === 'flush').length, 1);
});

test('CGI propagates listing, metadata and hydration failures and recovers', async () => {
	const {php, FS, events} = createFilesystem([]);
	const {readdir, stat, syncfs} = FS;
	assert.deepEqual(await php.readdir('/empty', {withFileTypes: true}), []);
	FS.readdir = () => { throw new Error('missing directory'); };
	await assert.rejects(php.readdir('/missing', {withFileTypes: true}), /missing directory/);
	FS.readdir = () => ['unreadable'];
	FS.stat = () => { throw new Error('metadata denied'); };
	await assert.rejects(php.readdir('/persist', {withFileTypes: true}), /metadata denied/);
	FS.readdir = readdir;
	FS.stat = stat;
	FS.syncfs = (populate, callback) => callback(new Error('hydrate failed'));
	await assert.rejects(php.readdir('/persist'), /hydrate failed/);
	FS.syncfs = syncfs;
	assert.deepEqual(await php.readdir('/persist', {withFileTypes: true}), []);
	assert.equal(events.includes('flush'), false);
	assert.equal(php.transactionStarted, false);
});

test('CGI reports failed write persistence and releases the lock for later reads', async () => {
	const {php, FS, events} = createFilesystem();
	FS.syncfs = (populate, callback) => queueMicrotask(() => callback(populate ? undefined : new Error('storage full')));
	await assert.rejects(php.writeFile('/persist/new.php', 'saved'), /storage full/);
	assert.deepEqual(await php.readFile('/persist/new.php'), new Uint8Array([65]));
	assert.equal(events.includes('write'), true);
	assert.equal(php.transactionStarted, false);
});

test('CGI leaves caller-owned transactions and nonpersistent storage alone', async () => {
	const {php, events} = createFilesystem();
	php.autoTransaction = false;
	await php.startTransaction();
	const transaction = php.transactionStarted;
	await php.readdir('/persist', {withFileTypes: true});
	await php.writeFile('/persist/new.php', 'saved');
	assert.equal(php.transactionStarted, transaction);
	assert.deepEqual(events.filter(event => ['populate', 'flush'].includes(event)), ['populate']);
	await php.commitTransaction();
	assert.deepEqual(events.filter(event => ['populate', 'flush'].includes(event)), ['populate', 'flush']);

	php.autoTransaction = true;
	(await php.binary).persist = false;
	events.length = 0;
	await php.readdir('/persist', {withFileTypes: true});
	await php.writeFile('/persist/new.php', 'saved');
	assert.equal(events.some(event => ['populate', 'flush'].includes(event)), false);
});
