import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// These are unit tests of the shipped EM_JS bodies, not a substitute for the
// public-entrypoint PHP/Asyncify/local-D1 tests in test/cloudflare.
const patch = fs.readFileSync(new URL('../../packages/pdo-cfd1/compatibility.patch', import.meta.url), 'utf8');
const source = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1)).join('\n');

/**
 * Loads the shipped JavaScript glue with a bounded, fake Wasm string heap.
 * @param {object} binding Mock D1 binding used by this isolated unit test.
 * @returns {object} Glue functions and mock state controls.
 */
function fixture(binding = { prepare: query => ({ run: async () => ({ success: true, results: [{ query }], meta: { changes: 0 } }) }) })
{
	const strings = new Map();
	let next = 1;
	const save = value => { const pointer = next++; strings.set(pointer, value); return pointer; };
	const Module = { cfd1: { mainDb: binding } };
	const context = vm.createContext({
		Module, Map, Object, Array, Number, String, Error
		, UTF8ToString: (pointer, length) => length === undefined ? strings.get(pointer) : strings.get(pointer).slice(0, length)
		, lengthBytesUTF8: value => Buffer.byteLength(value)
		, _malloc: () => next++
		, stringToUTF8: (value, pointer) => strings.set(pointer, value)
	});
	const functions = {};
	const args = { cfd1_js_init: [], cfd1_js_connect: ['name'], cfd1_js_prepare: ['statement', 'name', 'sql', 'length'], cfd1_js_execute: ['statement'] };
	for(const [name, parameters] of Object.entries(args))
	{
		const marker = source.indexOf(', ' + name + ',');
		assert.ok(marker >= 0, name);
		const start = source.indexOf('{\n', marker) + 2;
		const end = source.indexOf('\n});', start);
		const body = source.slice(start, end);
		functions[name] = vm.runInContext('(' + (name === 'cfd1_js_execute' ? 'async ' : '') + 'function(' + parameters.join(',') + '){\n' + body + '\n})', context);
	}
	functions.cfd1_js_init();
	const name = save('mainDb');
	const prepare = (sql, statement = 1) => functions.cfd1_js_prepare(statement, name, save(sql), sql.length);
	const execute = (parameters, statement = 1) => {
		Module.__pdoCfd1.statements.get(statement).params = parameters;
		return functions.cfd1_js_execute(statement);
	};
	const error = pointer => strings.get(pointer);
	return { Module, functions, prepare, execute, error, save, name };
}

test('D1 JavaScript glue parses without eval and rejects missing/malformed bindings', () => {
    assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(/);
    const f = fixture();
    assert.equal(f.functions.cfd1_js_connect(f.name), 0);
    assert.match(f.error(f.functions.cfd1_js_connect(f.save('missing'))), /^HY000:Missing or invalid D1 binding/);
    f.Module.cfd1.mainDb = {};
    assert.match(f.error(f.functions.cfd1_js_connect(f.name)), /^HY000:Missing or invalid D1 binding/);
});

test('mandatory PDO callbacks include an explicit failing exec adapter', () => {
    assert.match(source, /\.doer = cfd1_doer/);
    assert.match(source, /static zend_long cfd1_doer\(pdo_dbh_t \*dbh, const char \*sql, size_t length\)/);
    assert.match(source, /static zend_long cfd1_doer\(pdo_dbh_t \*dbh, const zend_string \*sql\)/);
    assert.match(source, /PDO::exec is not supported; use prepare\(\)->execute\(\)/);
});

test('SQL scanner counts only bare positional placeholders outside literals/comments', async () => {
    const f = fixture({ prepare: () => ({ bind: (...params) => ({ run: async () => ({ success: true, results: [{ n: params.length }] }) }) }) });
    assert.equal(f.prepare("SELECT ?, '?', \"?\", `?`, [?], 'it''s ?' -- :ignored ?\n /* @ignored ? */ , ?"), 0);
    assert.equal(f.Module.__pdoCfd1.statements.get(1).count, 2);
    assert.equal(await f.execute([1, 2]), 0);
    for(const sql of ['SELECT :named', 'SELECT @named', 'SELECT $named', 'SELECT ?1'])
    {
        assert.match(f.error(f.prepare(sql)), /^HYC00:/);
    }
});

test('prepared execution rebinds each call and exposes results and D1 changes', async () => {
    const calls = [];
    const f = fixture({ prepare: () => ({
        bind: (...params) => {
            calls.push(params);
            return { run: async () => ({ success: true, results: [{ value: params[0] }], meta: { changes: 1 } }) };
        }
    }) });
    assert.equal(f.prepare('SELECT ?'), 0);
    assert.equal(await f.execute([null]), 0);
    assert.equal(f.Module.__pdoCfd1.statements.get(1).rows[0].value, null);
    assert.equal(await f.execute(['next']), 0);
    assert.equal(f.Module.__pdoCfd1.statements.get(1).rows[0].value, 'next');
    assert.equal(f.Module.__pdoCfd1.statements.get(1).changes, 1);
    assert.deepEqual(calls, [[null], ['next']]);
    assert.equal(f.Module.__pdoCfd1.statements.get(1).params.length, 0);
});

test('async rejection and unsuccessful D1 results are returned as errors, with clean retry state', async () => {
    let attempt = 0;
    const f = fixture({ prepare: () => ({ run: async () => {
        await Promise.resolve();
        if(attempt++ === 0) throw new Error('rejected query');
        if(attempt === 2) return { success: false, error: 'unsuccessful query' };
        return { success: true, results: [{ ok: 1 }], meta: { changes: 0 } };
    } }) });
    f.prepare('SELECT 1');
    assert.match(f.error(await f.execute([])), /^HY000:rejected query/);
    assert.equal(f.Module.__pdoCfd1.statements.get(1).rows.length, 0);
    assert.match(f.error(await f.execute([])), /^HY000:unsuccessful query/);
    assert.equal(await f.execute([]), 0);
    assert.equal(f.Module.__pdoCfd1.statements.get(1).rows[0].ok, 1);
});

test('parameter count and sparse bindings fail without running a query', async () => {
    const f = fixture({ prepare: () => ({ run: async () => { throw new Error('must not run'); } }) });
    f.prepare('SELECT ?, ?');
    assert.match(f.error(await f.execute([1])), /^HY093:/);
    assert.match(f.error(await f.execute([1, 2, 3])), /^HY093:/);
    const sparse = [];
    sparse[1] = 2;
    assert.match(f.error(await f.execute(sparse)), /^HY093:/);
});

test('synchronous prepare/bind exceptions are captured too', async () => {
    const f = fixture({ prepare: () => { throw new Error('invalid SQL'); } });
    assert.match(f.error(f.prepare('bad SQL')), /^HY000:invalid SQL/);
    f.Module.cfd1.mainDb = { prepare: () => ({ bind: () => { throw new Error('invalid value'); } }) };
    assert.equal(f.prepare('SELECT ?'), 0);
    assert.match(f.error(await f.execute([1])), /^HY000:invalid value/);
});
