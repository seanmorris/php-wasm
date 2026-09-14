import {strict as assert} from 'node:assert';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const helper = fileURLToPath(new URL('../demo-web/public/scripts/query-workbench.php', import.meta.url));
const phpCheck = spawnSync('php', ['-r', 'exit(extension_loaded("pdo_sqlite") && extension_loaded("sqlite3") ? 0 : 1);']);
const nativePhpAvailable = !phpCheck.error && phpCheck.status === 0;
const runner = `
require $argv[1];
$request = json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
try {
    echo json_encode(query_workbench_handle($request, $argv[2]), JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    echo json_encode(['error' => ['message' => $error->getMessage(), 'code' => (string) $error->getCode()]], JSON_THROW_ON_ERROR);
}
`;

test('SQLite query workbench adapter', {skip: !nativePhpAvailable && 'Native PHP with sqlite3 and pdo_sqlite is required'}, async t => {
	const directory = mkdtempSync(join(tmpdir(), 'query-workbench-sqlite-'));
	const persist = join(directory, 'persist');
	const target = join(persist, 'database.sqlite');
	mkdirSync(persist);
	t.after(() => rmSync(directory, {recursive: true, force: true}));
	const initialized = spawnSync('php', ['-r'
	, `
        $db = new PDO('sqlite:' . $argv[1]);
        $db->exec('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)');
        $db->exec('CREATE VIEW item_view AS SELECT value FROM items');
    `
    , target], {encoding: 'utf8'});
	assert.equal(initialized.status, 0, initialized.stderr);
	const request = (sql, extra = {}) => {
		const response = spawnSync('php', ['-r', runner, helper, persist], {
			encoding: 'utf8'
			, input: JSON.stringify({engine: 'sqlite', target, action: 'execute', sql, ...extra})
			, maxBuffer: 2 * 1024 * 1024
		});
		assert.equal(response.status, 0, response.stderr);
		return JSON.parse(response.stdout);
	};
	const execute = (sql, extra) => {
		const response = request(sql, extra);
		assert.equal(response.error, undefined, response.error?.message);
		return response.results[0];
	};
	const count = () => execute('SELECT count(*) FROM items').rows[0][0].value;

	await t.test('opens existing tables and views with their columns', () => {
		const schema = request(undefined, {action: 'schema'});
		assert.deepEqual(schema.map(({name, type}) => ({name, type})), [
			{name: 'item_view', type: 'view'}
			, {name: 'items', type: 'table'}
		]);
		assert.equal(schema[0].schema, 'main');
		assert.deepEqual(schema[1].columns, [{name: 'id', type: 'INTEGER'}, {name: 'value', type: 'TEXT'}]);
	});

	await t.test('preserves duplicate names, 64-bit integers, null, empty text and binary', () => {
		const result = execute("SELECT 9223372036854775807 AS same, -9223372036854775808 AS same, NULL, '', 0, 1.25, X'00FF'");
		assert.deepEqual(result.columns.slice(0, 2).map(column => column.name), ['same', 'same']);
		assert.deepEqual(result.rows[0], [
			{type: 'integer', value: '9223372036854775807'}
			, {type: 'integer', value: '-9223372036854775808'}
			, null, '', {type: 'integer', value: '0'}, 1.25
			, {type: 'binary', value: 'AP8='}
		]);
		assert.equal(result.affectedRows, 0);
	});

	await t.test('uses runtime cell types instead of assuming a column has one type', () => {
		const result = execute("SELECT 1 AS mixed UNION ALL SELECT X'FF' UNION ALL SELECT NULL UNION ALL SELECT 'text'");
		assert.deepEqual(result.rows, [
			[{type: 'integer', value: '1'}]
			, [{type: 'binary', value: '/w=='}]
			, [null]
			, ['text']
		]);
	});

	await t.test('writes commit once, including RETURNING, and survive separate connections', () => {
		assert.equal(execute("INSERT INTO items(value) VALUES ('first')").affectedRows, 1);
		assert.equal(count(), '1');
		const result = execute("INSERT INTO items(value) VALUES ('second') RETURNING id, value");
		assert.equal(result.affectedRows, 1);
		assert.deepEqual(result.rows, [[{type: 'integer', value: '2'}, 'second']]);
		assert.equal(count(), '2');
	});

	await t.test('rejects batches before executing the first mutation', () => {
		for(const sql of [
			"INSERT INTO items(value) VALUES ('never'); INSERT INTO items(value) VALUES ('also never')"
			, "INSERT INTO items(value) VALUES ('never'); -- comment\n SELECT 2"
			, "INSERT INTO items(value) VALUES ('never'); /* comment */ SELECT 2"
			, "INSERT INTO items(value) VALUES ('never'); ;"
		]) {
			assert.match(request(sql).error.message, /one statement/);
		}
		assert.equal(count(), '2');
	});

	await t.test('lets SQLite parse quoted semicolons, comments and trigger bodies', () => {
		assert.deepEqual(execute("/* start ; */ SELECT ';' AS \"semi;colon\"; -- done ;\n/* final */").rows, [[';']]);
		assert.deepEqual(execute("SELECT '/* not a comment */'; /* trailing").rows, [['/* not a comment */']]);
		assert.deepEqual(execute("SELECT 'it''s; a string'").rows, [["it's; a string"]]);
		execute("CREATE TRIGGER uppercase_value AFTER INSERT ON items BEGIN UPDATE items SET value = upper(NEW.value) WHERE id = NEW.id; END;");
		execute("INSERT INTO items(value) VALUES ('third')");
		assert.deepEqual(execute('SELECT value FROM items WHERE id = 3').rows, [['THIRD']]);
	});

	await t.test('does not interpret SQL content as PHP', () => {
		assert.deepEqual(execute("SELECT '<?php throw new Exception(\"wrong\"); ?>'").rows, [['<?php throw new Exception("wrong"); ?>']]);
	});

	await t.test('bounds row counts without silently claiming a complete result', () => {
		const result = execute('SELECT * FROM items ORDER BY id', {maxRows: 2});
		assert.equal(result.rows.length, 2);
		assert.equal(result.returnedRows, 2);
		assert.equal(result.truncated, true);
		assert.equal(execute('SELECT * FROM items LIMIT 2', {maxRows: 2}).truncated, false);
		const large = execute('SELECT zeroblob(1048576) AS oversized');
		assert.deepEqual(large.rows, []);
		assert.equal(large.truncated, true);
	});

	await t.test('does not partially apply writes when RETURNING display is truncated', () => {
		const result = execute("INSERT INTO items(value) VALUES ('fourth'), ('fifth') RETURNING id", {maxRows: 1});
		assert.equal(result.truncated, true);
		assert.equal(result.affectedRows, 2);
		assert.equal(count(), '5');
	});

	await t.test('rejects session state, filesystem operations and unbound parameters', () => {
		for(const sql of [
			'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT example', 'RELEASE example'
			, "ATTACH DATABASE ':memory:' AS other", 'DETACH DATABASE other'
			, 'PRAGMA user_version = 12', "VACUUM INTO 'unwanted.sqlite'"
			, 'CREATE TEMP TABLE ephemeral (value)', 'SELECT ?', 'SELECT :value'
		]) {
			assert.ok(request(sql).error, sql);
		}
		assert.equal(count(), '5');
	});

	await t.test('missing targets, unrelated files and symlink escapes never create databases', () => {
		const missing = join(persist, 'missing.sqlite');
		assert.ok(request('SELECT 1', {target: missing}).error);
		assert.equal(existsSync(missing), false);
		const text = join(persist, 'not-a-database.txt');
		writeFileSync(text, 'This is not SQLite.');
		assert.match(request('SELECT 1', {target: text}).error.message, /not an initialized SQLite database/);
		const outside = join(directory, 'outside.sqlite');
		writeFileSync(outside, 'SQLite format 3\0');
		const link = join(persist, 'escape.sqlite');
		symlinkSync(outside, link);
		assert.match(request('SELECT 1', {target: link}).error.message, /under \/persist/);
		assert.ok(request('SELECT 1', {target: `${target}\0extra`}).error);
	});

	await t.test('returns actionable errors and remains usable after failure', () => {
		for(const [sql, extra] of [
			['SELECT * FROM nonexistent', {}], ['', {}], ['-- comment only', {}]
			, ['SELECT 1\0; SELECT 2', {}], ['SELECT 1', {maxRows: 0}]
			, ['SELECT 1', {maxRows: 1001}], ['SELECT 1', {maxRows: '2'}]
			, ['SELECT 1', {engine: 'pgsql'}], ['SELECT 1', {action: 'reset'}]
		]) {
			assert.ok(request(sql, extra).error?.message, `${sql} ${JSON.stringify(extra)}`);
		}
		assert.equal(count(), '5');
	});

	await t.test('table mode exposes only metadata-proven editable columns', () => {
		const table = request(undefined, {action: 'table', schema: 'main', table: 'items'});
		assert.deepEqual(table.edit, {schema: 'main', table: 'items', keyColumns: ['id'], editableColumns: ['value']});
		assert.equal(table.results[0].returnedRows, 5);
		const view = request(undefined, {action: 'table', table: 'item_view'});
		assert.deepEqual(view.edit.keyColumns, []);
		assert.deepEqual(view.edit.editableColumns, []);
		execute('CREATE TABLE keyless (value TEXT)');
		assert.deepEqual(request(undefined, {action: 'table', table: 'keyless'}).edit.keyColumns, []);
		execute('CREATE TABLE guarded (id INTEGER PRIMARY KEY, text TEXT, data BLOB, generated TEXT GENERATED ALWAYS AS (upper(text)) VIRTUAL)');
		assert.deepEqual(request(undefined, {action: 'table', table: 'guarded'}).edit.editableColumns, ['text']);
	});

	await t.test('keyed updates bind values and detect stale original values', () => {
		const replacement = "changed'; DELETE FROM items; --";
		const update = {
			action: 'update', table: 'items', column: 'value'
			, key: {id: {type: 'integer', value: '1'}}
			, original: 'first'
			, value: replacement
		};
		assert.deepEqual(request(undefined, update), {affectedRows: 1});
		assert.deepEqual(execute('SELECT value FROM items WHERE id = 1').rows, [[replacement]]);
		assert.equal(count(), '5');
		assert.match(request(undefined, {...update, value: 'stale overwrite'}).error.message, /Update conflict/);
		assert.deepEqual(execute('SELECT value FROM items WHERE id = 1').rows, [[replacement]]);
		assert.deepEqual(request(undefined, {...update, original: replacement, value: null}), {affectedRows: 1});
		assert.deepEqual(request(undefined, {...update, original: null, value: 'restored'}), {affectedRows: 1});
	});

	await t.test('composite keys and full 64-bit key values round-trip without narrowing', () => {
		execute('CREATE TABLE composite (account INTEGER, locale TEXT, value TEXT, PRIMARY KEY(account, locale))');
		execute("INSERT INTO composite VALUES (9223372036854775807, 'en', 'English'), (9223372036854775807, 'fr', 'French')");
		const table = request(undefined, {action: 'table', table: 'composite'});
		assert.deepEqual(table.edit.keyColumns, ['account', 'locale']);
		const edit = {
			action: 'update', table: 'composite', column: 'value'
			, key: {account: {type: 'integer', value: '9223372036854775807'}, locale: 'en'}
			, original: 'English', value: 'Updated'
		};
		assert.deepEqual(request(undefined, edit), {affectedRows: 1});
		assert.deepEqual(execute('SELECT value FROM composite ORDER BY locale').rows, [['Updated'], ['French']]);
		assert.ok(request(undefined, {...edit, key: {account: {type: 'integer', value: '9223372036854775807'}}}).error);
		assert.ok(request(undefined, {...edit, key: {account: null, locale: 'en'}}).error);
	});

	await t.test('unique keys are supported but partial and expression indexes are not identities', () => {
		execute('CREATE TABLE unique_key (name TEXT UNIQUE, value TEXT)');
		execute("INSERT INTO unique_key VALUES ('key; -- literal', 'before')");
		assert.deepEqual(request(undefined, {action: 'table', table: 'unique_key'}).edit.keyColumns, ['name']);
		assert.deepEqual(request(undefined, {
			action: 'update', table: 'unique_key', column: 'value'
			, key: {name: 'key; -- literal'}, original: 'before', value: 'after'
		}), {affectedRows: 1});
		execute('CREATE TABLE unsafe_key (name TEXT, value TEXT)');
		execute('CREATE UNIQUE INDEX partial_key ON unsafe_key(name) WHERE name IS NOT NULL');
		execute('CREATE UNIQUE INDEX expression_key ON unsafe_key(lower(name))');
		assert.deepEqual(request(undefined, {action: 'table', table: 'unsafe_key'}).edit.keyColumns, []);
	});

	await t.test('quoted identifiers cannot escape the validated table update', () => {
		execute('CREATE TABLE "odd""table" ("odd""key" TEXT PRIMARY KEY, "odd""value" TEXT)');
		execute('INSERT INTO "odd""table" VALUES (\'key\', \'before\')');
		assert.deepEqual(request(undefined, {
			action: 'update', table: 'odd"table', column: 'odd"value'
			, key: {'odd"key': 'key'}, original: 'before', value: 'after'
		}), {affectedRows: 1});
		assert.deepEqual(execute('SELECT "odd""value" FROM "odd""table"').rows, [['after']]);
		assert.ok(request(undefined, {action: 'table', table: 'items; DROP TABLE items;'}).error);
	});

	await t.test('updates reject key, generated, binary, view and arbitrary columns', () => {
		execute("INSERT INTO guarded(id, text, data) VALUES (1, 'before', X'FF')");
		const edit = {action: 'update', table: 'guarded', key: {id: {type: 'integer', value: '1'}}, original: 'before', value: 'after'};
		for(const column of ['id', 'generated', 'data', 'unlisted', 'text = NULL; --'])
{
			assert.ok(request(undefined, {...edit, column}).error, column);
}
		assert.ok(request(undefined, {...edit, table: 'item_view', column: 'value'}).error);
		assert.ok(request(undefined, {...edit, table: 'keyless', column: 'value', key: {value: 'before'}}).error);
		assert.ok(request(undefined, {...edit, column: 'text', original: {type: 'binary', value: '/w=='}}).error);
		assert.deepEqual(execute('SELECT text FROM guarded').rows, [['before']]);
	});

	await t.test('optimistic checks compare text case and original SQLite storage types', () => {
		execute('CREATE TABLE typed_edit (id INTEGER PRIMARY KEY, text TEXT COLLATE NOCASE, mixed)');
		execute("INSERT INTO typed_edit VALUES (1, 'before', '1')");
		const edit = {action: 'update', table: 'typed_edit', key: {id: {type: 'integer', value: '1'}}, column: 'text', original: 'before', value: 'after'};
		execute("UPDATE typed_edit SET text = 'BEFORE', mixed = 1");
		assert.match(request(undefined, edit).error.message, /Update conflict/);
		assert.match(request(undefined, {...edit, column: 'mixed', original: '1'}).error.message, /Update conflict/);
		assert.deepEqual(request(undefined, {...edit, column: 'mixed', original: {type: 'integer', value: '1'}}), {affectedRows: 1});
	});

	await t.test('constraint failures roll back and do not leave a connection transaction behind', () => {
		execute('CREATE TABLE constrained (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE)');
		execute("INSERT INTO constrained VALUES (1, 'one'), (2, 'two')");
		const edit = {action: 'update', table: 'constrained', key: {id: {type: 'integer', value: '1'}}, column: 'value', original: 'one'};
		assert.ok(request(undefined, {...edit, value: 'two'}).error);
		assert.ok(request(undefined, {...edit, value: null}).error);
		assert.deepEqual(execute('SELECT value FROM constrained ORDER BY id').rows, [['one'], ['two']]);
		assert.deepEqual(request(undefined, {...edit, value: 'changed'}), {affectedRows: 1});
	});

	await t.test('fresh query and edit connections enforce foreign keys', () => {
		execute('CREATE TABLE parent_row (id INTEGER PRIMARY KEY)');
		execute('CREATE TABLE child_row (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES parent_row(id))');
		execute('INSERT INTO parent_row VALUES (1)');
		execute('INSERT INTO child_row VALUES (1, 1)');
		assert.ok(request('INSERT INTO child_row VALUES (2, 2)').error);
		assert.ok(request(undefined, {
			action: 'update', table: 'child_row', column: 'parent'
			, key: {id: {type: 'integer', value: '1'}}
			, original: {type: 'integer', value: '1'}, value: '2'
		}).error);
		assert.deepEqual(execute('SELECT parent FROM child_row').rows, [[{type: 'integer', value: '1'}]]);
	});
});
