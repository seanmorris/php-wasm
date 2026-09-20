import {test, expect} from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const libType = process.env.LIB_TYPE ?? 'dynamic';

test.beforeEach(async ({page}) => {
	await page.goto('harness/index.html');
	await page.evaluate(({version, libType}) => {
		const query = new URLSearchParams({version, libType});
		const worker = new Worker(`/php-wasm/harness/idbfs-worker.mjs?${query}`, {type: 'module'});
		const pending = new Map();
		let next = 0;
		worker.onmessage = event => {
			const operation = pending.get(event.data.id);
			pending.delete(event.data.id);
			if(event.data.error) operation.reject(new Error(JSON.stringify(event.data.error)));
			else operation.resolve(event.data.result);
		};
		worker.onerror = event => {
			for(const operation of pending.values()) operation.reject(new Error(event.message));
			pending.clear();
		};
		window.idbfsRun = program => new Promise((resolve, reject) => {
			const id = ++next;
			pending.set(id, {resolve, reject});
			worker.postMessage({id, program});
		});
	}, {version, libType});
});

/**
 * Executes a self-contained program against real browser CGI filesystems.
 * @param {import('@playwright/test').Page} page Browser page owning the worker.
 * @param {(context: object) => Promise<object>} program Worker-side conformance check.
 * @returns {Promise<object>} Serializable observed state.
 */
const run = (page, program) => page.evaluate(source => window.idbfsRun(source), String(program));

test('incremental IDBFS commits native writes and metadata without scanning clean entries', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS, cgi} = runtimes[0];
		FS.mkdir('/persist/tree');
		for(let i = 0; i < 100; i++) FS.writeFile(`/persist/tree/${i}`, 'unchanged');
		await sync(FS);
		const backend = FS.lookupPath('/persist').node.mount.type;
		let local = 0, remote = 0;
		for(const [name, increment] of [['getLocalSet', () => local++], ['getRemoteSet', () => remote++]])
		{
			const original = backend[name];
			backend[name] = (...args) => {increment(); return original(...args);};
		}
		FS.writeFile('/preload/mutate.php', `<?php
file_put_contents('/persist/tree/0', "\\x00\\x01\\x7f\\x80\\xff\\r\\n");
$f = fopen('/persist/tree/1', 'r+'); ftruncate($f, 3); fclose($f);
chmod('/persist/tree/0', 0640); touch('/persist/tree/0', 1700000000);
symlink('/persist/tree/0', '/persist/link');
echo 'saved';`);
		// The wrapper's first HTTP request hydrates once. Warm HTTP commits must
		// avoid discovery, so establish that boundary before measuring the change.
		await cgi._beforeRequest(await cgi.binary);
		local = remote = 0;
		const response = await cgi.request(new Request('http://localhost/cgi/mutate.php'));
		const body = await response.text();
		if(body !== 'saved') return {status: response.status, body, stderr: new TextDecoder().decode(new Uint8Array(cgi.error))};
		await sync(FS);
		const scans = {local, remote};
		const fresh = await create();
		return {status: response.status, body, scans
			, bytes: [...fresh.FS.readFile('/persist/tree/0')]
			, short: fresh.FS.readFile('/persist/tree/1', {encoding: 'utf8'})
			, mode: fresh.FS.stat('/persist/tree/0').mode & 0o777
			, mtime: fresh.FS.stat('/persist/tree/0').mtime.getTime()
			, link: fresh.FS.readlink('/persist/link')
			, untouched: fresh.FS.readFile('/persist/tree/99', {encoding: 'utf8'})};
	});
	expect(result).toEqual({status: 200, body: 'saved', scans: {local: 0, remote: 0}, bytes: [0, 1, 127, 128, 255, 13, 10], short: 'unc', mode: 0o640, mtime: 1700000000000, link: '/persist/tree/0', untouched: 'unchanged'});
});

test('incremental IDBFS journals renamed trees, replacement paths and unlinked open files', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS} = runtimes[0];
		FS.mkdirTree('/persist/from/deep');
		FS.writeFile('/persist/from/deep/file', 'old');
		FS.writeFile('/persist/replaced', 'discard');
		FS.writeFile('/persist/unlinked', 'discard');
		await sync(FS);
		const overwritten = FS.open('/persist/replaced', 'r+');
		const unlinked = FS.open('/persist/unlinked', 'r+');
		FS.writeFile('/persist/from/deep/file', 'new');
		FS.rename('/persist/from', '/persist/moved');
		FS.rename('/persist/moved/deep/file', '/persist/replaced');
		FS.unlink('/persist/unlinked');
		FS.write(overwritten, new TextEncoder().encode('ghost'), 0, 5, 0);
		FS.write(unlinked, new TextEncoder().encode('ghost'), 0, 5, 0);
		FS.close(overwritten); FS.close(unlinked);
		FS.rmdir('/persist/moved/deep'); FS.rmdir('/persist/moved');
		FS.mkdir('/persist/moved'); FS.writeFile('/persist/moved/new', 'recreated');
		await sync(FS);
		const fresh = await create();
		return {replaced: fresh.FS.readFile('/persist/replaced', {encoding: 'utf8'})
			, recreated: fresh.FS.readFile('/persist/moved/new', {encoding: 'utf8'})
			, absent: ['/persist/from', '/persist/moved/deep', '/persist/unlinked'].map(path => fresh.FS.analyzePath(path).exists)};
	});
	expect(result).toEqual({replaced: 'new', recreated: 'recreated', absent: [false, false, false]});
});

test('aborted IDBFS commits reject acknowledgments and survive the next hydration', async ({page}) => {
	const result = await run(page, async ({runtimes, create}) => {
		const {FS, cgi} = runtimes[0];
		const original = IDBDatabase.prototype.transaction;
		let inject = true;
		IDBDatabase.prototype.transaction = function(...args) {
			const transaction = original.apply(this, args);
			if(inject && args[1] === 'readwrite')
			{
				inject = false;
				queueMicrotask(() => transaction.abort());
			}
			return transaction;
		};
		let rejected = false;
		try
{ await cgi.writeFile('/persist/retry', 'retained'); }
		catch
{ rejected = true; }
		finally
{ IDBDatabase.prototype.transaction = original; }
		const memory = FS.readFile('/persist/retry', {encoding: 'utf8'});
		// A later automatic RPC hydrates before reading. The failed write must
		// be retried durably before that hydration can replace in-memory state.
		const reply = await cgi.readFile('/persist/retry', {encoding: 'utf8'});
		const fresh = await create();
		return {rejected, memory, reply, persisted: fresh.FS.readFile('/persist/retry', {encoding: 'utf8'})};
	});
	expect(result).toEqual({rejected: true, memory: 'retained', reply: 'retained', persisted: 'retained'});
});

test('mutations during an IDBFS commit remain pending for the following commit', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS} = runtimes[0];
		FS.writeFile('/persist/changing', 'snapshot');
		const original = IDBDatabase.prototype.transaction;
		let inject = true;
		IDBDatabase.prototype.transaction = function(...args) {
			const transaction = original.apply(this, args);
			if(inject && args[1] === 'readwrite')
			{
				inject = false;
				queueMicrotask(() => {
					FS.writeFile('/persist/changing', 'later');
					FS.writeFile('/persist/created-during-commit', 'later');
				});
			}
			return transaction;
		};
		try
{ await sync(FS); }
		finally
{ IDBDatabase.prototype.transaction = original; }
		const first = await create();
		const snapshot = first.FS.readFile('/persist/changing', {encoding: 'utf8'});
		await sync(FS);
		const second = await create();
		return {snapshot, later: second.FS.readFile('/persist/changing', {encoding: 'utf8'}), created: second.FS.readFile('/persist/created-during-commit', {encoding: 'utf8'})};
	});
	expect(result).toEqual({snapshot: 'snapshot', later: 'later', created: 'later'});
});

test('independent runtimes preserve unrelated remote writes and hydrate each other’s changes', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const first = runtimes[0], second = await create();
		first.FS.writeFile('/persist/first', 'A');
		await sync(first.FS);
		second.FS.writeFile('/persist/second', 'B');
		await sync(second.FS);
		await sync(first.FS, true);
		await sync(second.FS, true);
		const read = FS => ['first', 'second'].map(file => FS.readFile(`/persist/${file}`, {encoding: 'utf8'}));
		const fresh = await create();
		return [read(first.FS), read(second.FS), read(fresh.FS)];
	});
	expect(result).toEqual([['A', 'B'], ['A', 'B'], ['A', 'B']]);
});

test('quota failures abort the whole batch and retain both writes for retry', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS, cgi} = runtimes[0];
		const original = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function(value, key) {
			if(key === '/persist/quota-b') throw new DOMException('Injected quota failure', 'QuotaExceededError');
			return original.call(this, value, key);
		};
		let replies;
		try
		{ replies = await Promise.allSettled([cgi.writeFile('/persist/quota-a', 'A'), cgi.writeFile('/persist/quota-b', 'B')]); }
		finally
		{ IDBObjectStore.prototype.put = original; }
		const beforeRetry = await create();
		const absent = ['quota-a', 'quota-b'].map(name => !beforeRetry.FS.analyzePath(`/persist/${name}`).exists);
		await sync(FS);
		const afterRetry = await create();
		return {errors: replies.map(reply => reply.reason.name), absent
			, persisted: ['quota-a', 'quota-b'].map(name => afterRetry.FS.readFile(`/persist/${name}`, {encoding: 'utf8'}))};
	});
	expect(result).toEqual({errors: ['QuotaExceededError', 'QuotaExceededError'], absent: [true, true], persisted: ['A', 'B']});
});

test('incremental records remain readable and writable by unmodified IDBFS', async ({page}) => {
	const result = await run(page, async ({runtimes, createLegacy, sync}) => {
		const {FS} = runtimes[0];
		FS.mkdirTree('/persist/original/child');
		FS.writeFile('/persist/original/child/data', new Uint8Array([0, 128, 255]));
		await sync(FS);
		FS.rename('/persist/original', '/persist/renamed');
		await sync(FS);
		const legacy = await createLegacy();
		const original = [...legacy.FS.readFile('/persist/renamed/child/data')];
		legacy.FS.writeFile('/persist/from-legacy', 'compatible');
		await sync(legacy.FS);
		await sync(FS, true);
		return {original, deleted: !legacy.FS.analyzePath('/persist/original').exists, fromLegacy: FS.readFile('/persist/from-legacy', {encoding: 'utf8'})};
	});
	expect(result).toEqual({original: [0, 128, 255], deleted: true, fromLegacy: 'compatible'});
});

test('dangling symlinks and retargeted links hydrate without touching their targets', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS} = runtimes[0];
		FS.symlink('/persist/missing', '/persist/dangling');
		FS.writeFile('/persist/target', 'contents');
		FS.chmod('/persist/target', 0o600);
		FS.symlink('/persist/target', '/persist/alias');
		await sync(FS);
		const second = await create();
		const mode = second.FS.stat('/persist/target').mode & 0o777;
		FS.unlink('/persist/alias');
		FS.symlink('/persist/different', '/persist/alias');
		await sync(FS);
		await sync(second.FS, true);
		return {dangling: second.FS.readlink('/persist/dangling'), retargeted: second.FS.readlink('/persist/alias'), mode};
	});
	expect(result).toEqual({dangling: '/persist/missing', retargeted: '/persist/different', mode: 0o600});
});

test('shared memory-map synchronization is persisted through native MEMFS stream operations', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS, php} = runtimes[0];
		FS.writeFile('/persist/mapped', new Uint8Array([1, 2, 3, 4]));
		await sync(FS);
		const stream = FS.open('/persist/mapped', 'r+');
		const mapping = FS.mmap(stream, 4, 0, 3, 1);
		php.HEAPU8.set([0, 128, 255, 10], mapping.ptr);
		FS.msync(stream, php.HEAPU8.slice(mapping.ptr, mapping.ptr + 4), 0, 4, 1);
		FS.close(stream);
		if(mapping.allocated) php._free(mapping.ptr);
		await sync(FS);
		const fresh = await create();
		return [...fresh.FS.readFile('/persist/mapped')];
	});
	expect(result).toEqual([0, 128, 255, 10]);
});

test('installing after files exist retains them when the initial full commit fails', async ({page}) => {
	const result = await run(page, async ({createLegacy, sync}) => {
		const {enableIncrementalIdbfs} = await import('/packages/php-cgi-wasm/idbfsSync.mjs');
		const {FS} = await createLegacy();
		FS.writeFile('/persist/before-install', 'retained');
		enableIncrementalIdbfs(FS);
		const original = IDBDatabase.prototype.transaction;
		let inject = true;
		IDBDatabase.prototype.transaction = function(...args) {
			const transaction = original.apply(this, args);
			if(inject && args[1] === 'readwrite')
			{
				inject = false;
				queueMicrotask(() => transaction.abort());
			}
			return transaction;
		};
		let rejected = false;
		try
		{ await sync(FS); }
		catch
		{ rejected = true; }
		finally
		{ IDBDatabase.prototype.transaction = original; }
		await sync(FS, true);
		const fresh = await createLegacy();
		return {rejected, persisted: fresh.FS.readFile('/persist/before-install', {encoding: 'utf8'})};
	});
	expect(result).toEqual({rejected: true, persisted: 'retained'});
});

test('nested IDBFS mounts retain ordinary reconciliation across mount and unmount', async ({page}) => {
	const result = await run(page, async ({runtimes, create, sync}) => {
		const {FS} = runtimes[0];
		const backend = FS.lookupPath('/persist').node.mount.type;
		FS.mkdir('/persist/nested');
		await sync(FS);
		FS.mount(backend, {autoPersist: false}, '/persist/nested');
		FS.writeFile('/persist/nested/inside', 'nested');
		FS.writeFile('/persist/outside', 'parent');
		await sync(FS);
		const fresh = await create();
		const values = [fresh.FS.readFile('/persist/nested/inside', {encoding: 'utf8'}), fresh.FS.readFile('/persist/outside', {encoding: 'utf8'})];
		FS.unmount('/persist/nested');
		await sync(FS);
		const unmounted = await create();
		return {values, childHiddenAfterUnmount: !unmounted.FS.analyzePath('/persist/nested/inside').exists};
	});
	expect(result).toEqual({values: ['nested', 'parent'], childHiddenAfterUnmount: true});
});
