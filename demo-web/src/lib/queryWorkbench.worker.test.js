// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createWorkbenchActions, leadingSqlKeyword, validateWorkbenchTarget, workbenchLimits } from './queryWorkbench.worker.js';
import { drupalPgsqlDatabase } from './drupalDatabase.js';
import { coordinateDemoDatabase, withDemoDatabaseLock } from './demoDatabaseRuntime.worker.js';

const target = {engine: 'pgsql', target: drupalPgsqlDatabase};
let pg, actions;
const run = (sql, extra = {}) => actions.queryWorkbenchExecute(null, {...target, requestId: 'test', sql, ...extra});

beforeAll(async () => {
	pg = new PGlite();
	await pg.waitReady;
	actions = createWorkbenchActions({withLock: callback => callback(), withPGlite: (_, callback) => callback(pg), postgresExists: async () => true});
	await pg.exec(`CREATE TABLE workbench_test (id integer PRIMARY KEY, label text, amount numeric, raw bytea);
		INSERT INTO workbench_test VALUES (1, 'original', 1.230, '\\x0102'), (2, NULL, NULL, NULL);
		CREATE TABLE composite_test (a text, b integer, label text, PRIMARY KEY (a,b));
		INSERT INTO composite_test VALUES ('one',1,'before'), ('one',2,'other');
		CREATE TABLE unique_test (code text UNIQUE, label text);
		INSERT INTO unique_test VALUES ('one','before');
		CREATE TABLE edit_types (id integer PRIMARY KEY, fixed char(5), flag boolean, amount numeric);
		INSERT INTO edit_types VALUES (1, 'abc', true, 1.230);
		CREATE TABLE keyless_test (label text);
		CREATE TABLE inherited_parent (id integer PRIMARY KEY, label text);
		CREATE TABLE inherited_child () INHERITS (inherited_parent);
		INSERT INTO inherited_parent VALUES (1, 'parent');
		INSERT INTO inherited_child VALUES (1, 'child');
		CREATE VIEW view_test AS SELECT * FROM workbench_test;
		CREATE TABLE "quoted table" ("key col" integer PRIMARY KEY, "quote""col" text);
		INSERT INTO "quoted table" VALUES (1, 'before');`);
}, 30000);
afterAll(async () => { await pg?.close(); });

describe('query workbench PostgreSQL contract with a real engine', () => {
	it('preserves duplicate columns, NULL, numeric precision, bytea and JSON text', async () => {
		const {results: [result]} = await run(`SELECT 1 AS duplicate, 2 AS duplicate, NULL AS empty,
			9223372036854775807::bigint AS large, 12345678901234567890.123::numeric AS decimal,
			'\\x0001ff'::bytea AS bytes, '{"value":9223372036854775807}'::json AS document, false AS flag`);
		expect(result.columns.map(column => column.name)).toEqual(['duplicate', 'duplicate', 'empty', 'large', 'decimal', 'bytes', 'document', 'flag']);
		expect(result.rows[0]).toEqual([
			'1'
			, '2'
			, null
			, {type: 'integer', value: '9223372036854775807'}
			, {type: 'numeric', value: '12345678901234567890.123'}
			, {type: 'binary', value: '\\x0001ff', encoding: 'hex'}
			, {type: 'json', value: '{"value":9223372036854775807}'}
			, false
		]);
	});

	it('keeps empty-result headers and bounds rows and serialized data', async () => {
		const empty = await run('SELECT id, label FROM workbench_test WHERE false');
		expect(empty.results[0].columns.map(column => column.name)).toEqual(['id', 'label']);
		expect(empty.results[0].rows).toEqual([]);
		const capped = await run('SELECT generate_series(1, 20)', {maxRows: 2});
		expect(capped.results[0]).toMatchObject({returnedRows: 2, truncated: true});
		const large = await run(`SELECT repeat('x', ${workbenchLimits.maxBytes + 1})`);
		expect(large.results[0]).toMatchObject({returnedRows: 0, truncated: true});
	});

	it('rejects batches before any writes, but supports quoted semicolons and comments', async () => {
		await expect(run("INSERT INTO workbench_test (id) VALUES (99); SELECT 1")).rejects.toThrow(/multiple commands/i);
		expect((await run('SELECT id FROM workbench_test WHERE id=99')).results[0].rows).toEqual([]);
		expect((await run("/* nested /* ; */ comment */ SELECT ';' AS value; -- trailing ;")).results[0].rows).toEqual([[';']]);
		await expect(run('/* comment */ BEGIN')).rejects.toThrow(/standalone/);
		await expect(run('SET search_path = public')).rejects.toThrow(/standalone/);
		await expect(run('SELECT * FROM missing_workbench_table')).rejects.toThrow(/does not exist/);
	});

	it('discovers schema and only permits proven keyed table previews to be edited', async () => {
		const schema = await actions.queryWorkbenchSchema(null, target);
		expect(schema.find(table => table.name === 'workbench_test')).toMatchObject({schema: 'public', type: 'table', columns: expect.arrayContaining([{name: 'label', type: 'text'}])});
		const preview = await actions.queryWorkbenchTable(null, {...target, schema: 'public', table: 'workbench_test', maxRows: 1});
		expect(preview.edit).toEqual({schema: 'public', table: 'workbench_test', keyColumns: ['id'], editableColumns: ['label', 'amount']});
		expect(preview.results[0]).toMatchObject({returnedRows: 1, truncated: true});
		for(const table of ['keyless_test', 'view_test', 'inherited_parent'])
		{
			expect((await actions.queryWorkbenchTable(null, {...target, schema: 'public', table})).edit.editableColumns).toEqual([]);
		}
		expect(await run('SELECT * FROM workbench_test')).not.toHaveProperty('edit');
	});

	it('binds updates, detects stale edits and does not modify a second row', async () => {
		const edit = {...target, schema: 'public', table: 'workbench_test', key: {id: '1'}, column: 'label', original: 'original', value: "'; DELETE FROM workbench_test; --"};
		expect(await actions.queryWorkbenchUpdateRow(null, edit)).toEqual({affectedRows: 1});
		await expect(actions.queryWorkbenchUpdateRow(null, edit)).rejects.toThrow(/conflict/i);
		const result = await run('SELECT id, label FROM workbench_test ORDER BY id');
		expect(result.results[0].rows).toEqual([['1', edit.value], ['2', null]]);
		const preview = await actions.queryWorkbenchTable(null, {...target, schema: 'public', table: 'workbench_test'});
		expect(preview.results[0].rows.map(row => row[0])).toEqual(['1', '2']);
		await expect(actions.queryWorkbenchUpdateRow(null, {...edit, column: 'id'})).rejects.toThrow(/read-only/);
		await expect(actions.queryWorkbenchUpdateRow(null, {...edit, key: {id: null}})).rejects.toThrow(/NULL/);
		await expect(actions.queryWorkbenchUpdateRow(null, {...edit, key: {other: '1'}})).rejects.toThrow();
	});

	it('supports composite/unique keys and quoted identifiers', async () => {
		for(const [table, key, column] of [
			['composite_test', {a: 'one', b: '1'}, 'label']
			, ['unique_test', {code: 'one'}, 'label']
			, ['quoted table', {'key col': '1'}, 'quote"col']
		]){
			const preview = await actions.queryWorkbenchTable(null, {...target, schema: 'public', table});
			expect(preview.edit.keyColumns).toEqual(Object.keys(key));
			expect(await actions.queryWorkbenchUpdateRow(null, {...target, schema: 'public', table, key, column, original: 'before', value: 'after'})).toEqual({affectedRows: 1});
		}
	});

	it('compares original values through their type output without trimming CHAR', async () => {
		const preview = await actions.queryWorkbenchTable(null, {...target, schema: 'public', table: 'edit_types'});
		const row = preview.results[0].rows[0];
		for(const [column, original, value] of [
			['fixed', row[1], 'def']
			, ['flag', row[2], 'false']
			, ['amount', row[3], null]
		]) {
			expect(await actions.queryWorkbenchUpdateRow(null, {...target, schema: 'public', table: 'edit_types', key: {id: '1'}, column, original, value})).toEqual({affectedRows: 1});
		}
	});
});

it.each([false, true])('discovers existing SQLite files including Laravel with PostgreSQL installed=%s, without opening an engine', async installed => {
	const laravelTarget = '/persist/laravel-11/database/database.sqlite';
	const drupalTarget = '/persist/drupal-11.4.5/web/sites/default/files/.sqlite';
	const wordpressTarget = '/persist/wordpress-7.1/wp-content/database/.ht.sqlite';
	const analyzePath = vi.fn(async path => ({exists: path !== wordpressTarget, object: {isFolder: path === drupalTarget}}));
	const queryWorkbenchSqlite = vi.fn();
	const open = vi.fn();
	const postgresExists = vi.fn(async () => installed);
	const discover = createWorkbenchActions({withLock: callback => callback(), withPGlite: open, postgresExists});
	const found = await discover.queryWorkbenchTargets({analyzePath, queryWorkbenchSqlite});
	expect(found).toEqual([
		{engine: 'sqlite', target: laravelTarget, label: 'Laravel / SQLite'}
		, ...(installed ? [{engine: 'pgsql', target: drupalPgsqlDatabase, label: 'Drupal / PostgreSQL (PGlite)'}] : [])
	]);
	expect(analyzePath.mock.calls.map(([path]) => path)).toEqual([drupalTarget, wordpressTarget, laravelTarget]);
	expect(postgresExists).toHaveBeenCalledExactlyOnceWith(drupalPgsqlDatabase);
	expect(queryWorkbenchSqlite).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
});

it('does not create an IndexedDB store when discovering databases on an empty installation', async () => {
	const indexedDb = {databases: vi.fn(async () => []), open: vi.fn()};
	vi.stubGlobal('indexedDB', indexedDb);
	try
	{
		const open = vi.fn();
		const discover = createWorkbenchActions({withLock: callback => callback(), withPGlite: open});
		expect(await discover.queryWorkbenchTargets({analyzePath: vi.fn(async () => ({exists: false}))})).toEqual([]);
		expect(indexedDb.databases).toHaveBeenCalledOnce();
		expect(indexedDb.open).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
	}
	finally
	{
		vi.unstubAllGlobals();
	}
});

it('validates targets and does not open a missing PostgreSQL database', async () => {
	expect(() => validateWorkbenchTarget({engine: 'sqlite', target: '/persist/../etc/test.db'})).toThrow();
	expect(() => validateWorkbenchTarget({engine: 'pgsql', target: 'idb://new-database'})).toThrow();
	const open = vi.fn();
	const missing = createWorkbenchActions({withLock: callback => callback(), withPGlite: open, postgresExists: async () => false});
	await expect(missing.queryWorkbenchExecute(null, {...target, requestId: 'test', sql: 'SELECT 1'})).rejects.toThrow(/not installed/);
	expect(open).not.toHaveBeenCalled();
});

it('reads the first keyword without confusing nested comments with executable SQL', () => {
	expect(leadingSqlKeyword('-- a\n /* b /* c */ d */ SELECT 1')).toBe('SELECT');
	expect(() => leadingSqlKeyword('/* never closes')).toThrow(/Unterminated/);
});

it('serializes entire CGI requests, filesystem RPCs and PGlite operations with one outer lock', async () => {
	const events = [];
	let release;
	const gate = new Promise(resolve => { release = resolve; });
	class FakeRuntime
	{
		async request()
{ events.push('cgi-start'); await gate; events.push('cgi-flushed'); }
		async _handleMessageEvent()
{ events.push('filesystem'); }
	}
	const Runtime = coordinateDemoDatabase(FakeRuntime);
	const runtime = new Runtime();
	const first = runtime.request({});
	const second = withDemoDatabaseLock(() => { events.push('postgres'); });
	const third = runtime._handleMessageEvent({data: {action: 'writeFile'}});
	await Promise.resolve();
	expect(events).toEqual(['cgi-start']);
	release();
	await Promise.all([first, second, third]);
	expect(events).toEqual(['cgi-start', 'cgi-flushed', 'postgres', 'filesystem']);
});

it('transports Unicode as JSON data through CGI and restores the temporary helper host', async () => {
	vi.stubGlobal('location', new URL('https://example.test/php-wasm/cgi-worker.js'));
	const payload = {engine: 'sqlite', target: '/persist/demo.sqlite', sql: "SELECT 'café 🚀'"};
	let body;
	class FakeRuntime
	{
		vHosts = [{pathPrefix: '/php-wasm/cgi-bin/site/', directory: '/persist/site'}];
		async request(request)
		{
			body = await request.text();
			expect(this.vHosts[0].directory).toBe('/preload/query-workbench');
			return Response.json({results: []});
		}
	}
	try
	{
		const Runtime = coordinateDemoDatabase(FakeRuntime);
		const runtime = new Runtime();
		const hosts = runtime.vHosts;
		expect(await runtime.queryWorkbenchSqlite(payload)).toEqual({results: []});
		expect([...body].every(character => character.charCodeAt(0) < 128)).toBe(true);
		expect(JSON.parse(body)).toEqual(payload);
		expect(runtime.vHosts).toBe(hosts);
	}
	finally
	{
		vi.unstubAllGlobals();
	}
});
