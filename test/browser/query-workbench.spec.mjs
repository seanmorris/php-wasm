import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

// The legacy browser server serves a different application and CGI worker.
// test/demo-web-test.sh opts this suite into the built demo artifact instead.
test.skip(!process.env.DEMO_WEB_ARTIFACT_ROOT, 'Requires the built demo-web artifact server.');

const pgsqlTarget = 'idb://host=drupal-11-pg18 dbname=postgres port=5432';

const rpc = (page, action, ...params) => page.evaluate(({action, params}) => {
	return new Promise((resolve, reject) => {
		const token = `query-workbench-browser-${crypto.randomUUID()}`;
		const controller = navigator.serviceWorker.controller;

		if(!controller)
		{
			reject(new Error('No controlling CGI service worker.'));
			return;
		}

		const cleanup = () => {
			clearTimeout(timeout);
			navigator.serviceWorker.removeEventListener('message', onMessage);
		};
		const onMessage = event => {
			if(event.data?.re !== token) return;
			cleanup();

			if(event.data.error)
			{
				reject(new Error(event.data.error.message ?? String(event.data.error)));
			}
			else resolve(event.data.result);
		};
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`No worker reply for ${action}; execution was not cancelled.`));
		}, 180000);

		navigator.serviceWorker.addEventListener('message', onMessage);
		controller.postMessage({action, token, params});
	});
}, {action, params});

const waitForWorker = async page => {
	await expect.poll(
		() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')
		, {timeout: 180000}
	).toContain('/php-wasm/cgi-worker.js');
	await rpc(page, 'runtimeReady');
};

const phpString = value => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const fetchFixture = (page, fixture, method = 'GET') => page.evaluate(async ({url, method}) => {
	const response = await fetch(url, {method, cache: 'no-store'});
	const body = await response.text();
	if(!response.ok) throw new Error(`CGI fixture returned ${response.status}: ${body}`);
	return JSON.parse(body);
}, {url: fixture.url, method});

// Each Playwright test has its own browser storage. Only setup explicitly creates
// a database; the workbench must never create one merely by opening a target.
const createFixture = async (page, engine, {keys = false} = {}) => {
	const id = randomUUID();
	const target = engine === 'pgsql' ? pgsqlTarget : `/persist/query-workbench-${id}.sqlite`;
	const name = `query-workbench-${id}.php`;
	const dsn = engine === 'pgsql' ? pgsqlTarget.replace('idb://', 'pgsql:') : `sqlite:${target}`;
	const fixture = {engine, target, url: `/php-wasm/cgi-bin/${name}`};
	const seedSql = [
		'CREATE TABLE workbench_fixture (id INTEGER PRIMARY KEY, label TEXT NOT NULL)'
		, "INSERT INTO workbench_fixture (id, label) VALUES (1, 'seed;value'), (2, 'second'), (3, 'third')"
		, ...(keys ? [
			'CREATE TABLE workbench_composite (group_id INTEGER NOT NULL, item_id INTEGER NOT NULL, label TEXT, PRIMARY KEY (group_id, item_id))'
			, "INSERT INTO workbench_composite VALUES (1, 1, 'first group'), (2, 1, 'second group')"
			, 'CREATE TABLE workbench_unique (code TEXT NOT NULL UNIQUE, label TEXT)'
			, "INSERT INTO workbench_unique VALUES ('one', 'first unique'), ('two', 'second unique')"
		] : [])
	];

	if(!(await rpc(page, 'analyzePath', '/persist/www')).exists)
	{
		await rpc(page, 'mkdir', '/persist/www');
	}

	await rpc(page, 'writeFile', `/persist/www/${name}`, `<?php
header('Content-Type: application/json');
$dsn = ${phpString(dsn)};
${engine === 'sqlite' ? `if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !is_file(${phpString(target)})) {
    http_response_code(500);
    echo json_encode(['error' => 'The persisted SQLite fixture is missing.']);
    exit;
}` : ''}
$pdo = new PDO($dsn);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach (json_decode(${phpString(JSON.stringify(seedSql))}, true) as $sql) {
        $pdo->exec($sql);
    }
}
echo json_encode($pdo->query('SELECT id, label FROM workbench_fixture ORDER BY id')->fetchAll(PDO::FETCH_ASSOC));
`);

	if(engine === 'pgsql')
	{
		for(const sql of seedSql) await rpc(page, 'runSql', target, sql);
	}
	else
	{
		await fetchFixture(page, fixture, 'POST');
	}

	return fixture;
};

const execute = (page, fixture, sql, maxRows = 100) => rpc(page, 'queryWorkbenchExecute', {
	requestId: randomUUID(), ...fixture, sql, maxRows
});

// The adapters retain lossless typed cells; compare their displayed values to
// CGI output without coercing database integers through JavaScript Number.
const displayedRows = result => result.rows.map(row => row.map(cell => (
	cell === null ? null : typeof cell === 'object' ? cell.value : String(cell)
)));

const connect = async (page, fixture) => {
	await page.getByRole('combobox', {name: 'Database engine'}).selectOption(fixture.engine);
	if(fixture.engine === 'sqlite')
	{
		await page.getByRole('textbox', {name: 'SQLite database path'}).fill(fixture.target);
	}
	await page.getByRole('button', {name: 'Connect', exact: true}).click();
	await expect(page.getByRole('button', {name: 'Run', exact: true})).toBeEnabled({timeout: 180000});
};

const runInEditor = async (page, sql) => {
	// Ace's accessible textarea is a hidden keyboard bridge, not a click target.
	await page.locator('#query-editor').click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.insertText(sql);
	await page.getByRole('button', {name: 'Run', exact: true}).click();
};

test('query workbench has one Extras entry using the production base path', async ({page}) => {
	await page.goto('home.html?no-service-worker', {waitUntil: 'domcontentloaded'});
	await page.getByRole('heading', {name: 'More...'}).getByRole('button').click();
	const links = page.getByRole('link', {name: /Query Workbench/i});
	await expect(links).toHaveCount(1);
	await expect(links).toHaveAttribute('href', '/php-wasm/query-workbench.html');
	await links.click();
	await expect(page).toHaveURL(/\/php-wasm\/query-workbench\.html(?:\?|$)/);
	await expect(page.getByRole('combobox', {name: 'Database engine'})).toBeVisible();
});

test('query workbench keeps mobile controls reachable without horizontal page overflow', async ({page}) => {
	await page.setViewportSize({width: 390, height: 740});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await expect(page.getByRole('combobox', {name: 'Database engine'})).toBeVisible();
	const toggle = page.getByRole('button', {name: 'Toggle schemas', exact: true});
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('complementary', {name: 'Database navigator'})).toBeHidden();
	await page.locator('#query-editor').scrollIntoViewIfNeeded();
	await expect(page.locator('#query-editor')).toBeVisible();
	await page.getByRole('textbox', {name: 'SQL file path', exact: true}).scrollIntoViewIfNeeded();
	const width = await page.evaluate(() => ({
		viewport: document.documentElement.clientWidth,
		page: document.documentElement.scrollWidth,
		editor: document.querySelector('#query-editor').getBoundingClientRect().width
	}));
	expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
	expect(width.editor).toBeGreaterThan(200);
	expect(width.editor).toBeLessThanOrEqual(width.viewport);
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByRole('combobox', {name: 'Database engine'})).toBeVisible();
});

for(const engine of ['sqlite', 'pgsql'])
{
	test(`${engine} workbench executes against the persisted CGI database without URL autorun`, async ({page}) => {
		test.setTimeout(600000);
		const runtimeFailures = [];
		page.on('pageerror', error => runtimeFailures.push(error.message));
		page.on('dialog', dialog => dialog.accept());

		await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
		await waitForWorker(page);
		const fixture = await createFixture(page, engine);
		const query = new URLSearchParams({
			engine, target: fixture.target, sql: 'DELETE FROM workbench_fixture', autorun: 'true'
		});
		await page.goto(`query-workbench.html?${query}`, {waitUntil: 'domcontentloaded'});
		await waitForWorker(page);
		await connect(page, fixture);

		const schema = await rpc(page, 'queryWorkbenchSchema', fixture);
		expect(schema).toEqual(expect.arrayContaining([
			expect.objectContaining({
				name: 'workbench_fixture', columns: expect.arrayContaining([
					expect.objectContaining({name: 'id'}), expect.objectContaining({name: 'label'})
				])
			})
		]));
		await expect(page.getByRole('table', {name: 'Query result 1'})).toHaveCount(0);
		expect(await fetchFixture(page, fixture)).toHaveLength(3);

		await runInEditor(page, 'SELECT id, label FROM workbench_fixture ORDER BY id');
		const resultTable = page.getByRole('table', {name: 'Query result 1'});
		await expect(resultTable).toContainText('seed;value', {timeout: 180000});
		await expect(resultTable.getByRole('columnheader')).toHaveText(['#', 'id', 'label']);
		await expect(page.getByRole('button', {name: /^Edit row /})).toHaveCount(0);

		await runInEditor(page, "UPDATE workbench_fixture SET label = 'from workbench' WHERE id = 1");
		await expect(page.getByRole('button', {name: 'Run', exact: true})).toBeEnabled({timeout: 180000});
		expect((await fetchFixture(page, fixture))[0]).toEqual({id: 1, label: 'from workbench'});

		await page.getByText(`${engine === 'pgsql' ? 'public' : 'main'}.workbench_fixture`, {exact: true}).click();
		await page.getByRole('button', {name: 'Select rows', exact: true}).click();
		// Grid position is not row identity: PostgreSQL UPDATE can move a tuple.
		const keyedRow = resultTable.getByRole('row').filter({
			has: page.getByRole('cell', {name: '1', exact: true})
		});
		await keyedRow.getByRole('button', {name: /^Edit row \d+ label$/}).click({timeout: 180000});
		await page.getByRole('textbox', {name: 'Cell value', exact: true}).fill('from cell editor café 🚀');
		await page.getByRole('button', {name: 'Save row', exact: true}).click();
		await expect(resultTable).toContainText('from cell editor café 🚀', {timeout: 180000});
		expect((await fetchFixture(page, fixture))[0]).toEqual({id: 1, label: 'from cell editor café 🚀'});

		// Execute and CGI/PDO requests intentionally overlap against the same store.
		const [workbenchRows, cgiRows] = await Promise.all([
			execute(page, fixture, 'SELECT id, label FROM workbench_fixture ORDER BY id')
			, fetchFixture(page, fixture)
		]);
		expect(displayedRows(workbenchRows.results[0])).toEqual(cgiRows.map(row => [String(row.id), row.label]));

		// Refresh reconstructs the PHP runtime and reloads its persisted filesystem.
		await rpc(page, 'refresh');
		await page.reload({waitUntil: 'domcontentloaded'});
		await waitForWorker(page);
		expect((await fetchFixture(page, fixture))[0]).toEqual({id: 1, label: 'from cell editor café 🚀'});
		expect(displayedRows((await execute(page, fixture, 'SELECT COUNT(*) AS total FROM workbench_fixture')).results[0]))
			.toEqual([['3']]);
		expect(runtimeFailures).toEqual([]);
	});

	test(`${engine} workbench rejects batches and missing targets and preserves result shape`, async ({page}) => {
		test.setTimeout(600000);
		await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
		await waitForWorker(page);
		const fixture = await createFixture(page, engine, {keys: true});

		await expect(execute(page, fixture,
			"UPDATE workbench_fixture SET label = 'must not run'; DELETE FROM workbench_fixture"
		)).rejects.toThrow();
		expect((await fetchFixture(page, fixture))[0].label).toBe('seed;value');
		await expect(execute(page, fixture, 'BEGIN')).rejects.toThrow();
		await expect(execute(page, fixture, 'SELECT * FROM workbench_missing_table')).rejects.toThrow();

		const literal = await execute(page, fixture, "SELECT 'literal;semicolon' AS value; -- trailing comment");
		expect(literal.results[0].rows).toEqual([['literal;semicolon']]);
		const exactValues = await execute(page, fixture,
			"SELECT CAST(9223372036854775807 AS bigint) AS huge, NULL AS n, '' AS blank"
		);
		expect(exactValues.results[0].rows).toEqual([[
			{type: 'integer', value: '9223372036854775807'}, null, ''
		]]);
		const binary = await execute(page, fixture, engine === 'sqlite'
			? "SELECT X'00ff41' AS bytes"
			: "SELECT decode('00ff41', 'hex') AS bytes"
		);
		expect(binary.results[0].rows[0][0]).toMatchObject({
			type: 'binary', value: engine === 'sqlite' ? 'AP9B' : '\\x00ff41'
		});
		const duplicate = await execute(page, fixture,
			'SELECT id AS repeated, label AS repeated FROM workbench_fixture WHERE id = 1'
		);
		expect(duplicate.results[0].columns.map(column => column.name)).toEqual(['repeated', 'repeated']);
		expect(displayedRows(duplicate.results[0])).toEqual([['1', 'seed;value']]);
		const empty = await execute(page, fixture, 'SELECT id, label FROM workbench_fixture WHERE id = -1');
		expect(empty.results[0].columns.map(column => column.name)).toEqual(['id', 'label']);
		expect(empty.results[0].rows).toEqual([]);
		const capped = await execute(page, fixture, 'SELECT id FROM workbench_fixture ORDER BY id', 1);
		expect(displayedRows(capped.results[0])).toEqual([['1']]);
		expect(capped.results[0].returnedRows).toBe(1);
		expect(capped.results[0].truncated).toBe(true);

		// Arbitrary SQL has no edit authorization, even when it selects one table.
		expect(capped.edit).toBeUndefined();
		const table = {engine, target: fixture.target, schema: engine === 'pgsql' ? 'public' : 'main', table: 'workbench_fixture'};
		const preview = await rpc(page, 'queryWorkbenchTable', {...table, maxRows: 100});
		expect(preview.edit).toEqual(expect.objectContaining({
			schema: table.schema, table: table.table, keyColumns: ['id']
		}));
		expect(preview.edit.editableColumns).toContain('label');
		const columns = preview.results[0].columns.map(column => column.name);
		const firstRow = preview.results[0].rows.find(row => row[columns.indexOf('label')] === 'seed;value');
		const key = {id: firstRow[columns.indexOf('id')]};
		const original = firstRow[columns.indexOf('label')];
		// Quotes and SQL-looking text are a cell value, never executable SQL.
		const value = "edited café 🚀 ' value; DELETE FROM workbench_fixture --";
		expect(await rpc(page, 'queryWorkbenchUpdateRow', {...table, key, column: 'label', value, original}))
			.toEqual({affectedRows: 1});
		await expect(rpc(page, 'queryWorkbenchUpdateRow', {
			...table, key, column: 'label', value: 'stale overwrite', original
		})).rejects.toThrow();
		await expect(rpc(page, 'queryWorkbenchUpdateRow', {
			...table, key: {id: null}, column: 'label', value: 'null key overwrite', original: value
		})).rejects.toThrow();
		const editedRows = await fetchFixture(page, fixture);
		expect(editedRows).toHaveLength(3);
		expect(editedRows[0]).toEqual({id: 1, label: value});
		expect(editedRows[1].label).toBe('second');

		const composite = {...table, table: 'workbench_composite'};
		const compositePreview = await rpc(page, 'queryWorkbenchTable', composite);
		expect(compositePreview.edit.keyColumns).toEqual(['group_id', 'item_id']);
		const compositeColumns = compositePreview.results[0].columns.map(column => column.name);
		const compositeRow = compositePreview.results[0].rows.find(row => row[compositeColumns.indexOf('label')] === 'first group');
		const compositeKey = Object.fromEntries(compositePreview.edit.keyColumns.map(column => [
			column, compositeRow[compositeColumns.indexOf(column)]
		]));
		await expect(rpc(page, 'queryWorkbenchUpdateRow', {
			...composite, key: {item_id: compositeKey.item_id}, column: 'label', value: 'incomplete key', original: 'first group'
		})).rejects.toThrow();
		expect(await rpc(page, 'queryWorkbenchUpdateRow', {
			...composite, key: compositeKey, column: 'label', value: null, original: 'first group'
		})).toEqual({affectedRows: 1});
		expect((await execute(page, fixture, 'SELECT label FROM workbench_composite ORDER BY group_id')).results[0].rows)
			.toEqual([[null], ['second group']]);

		const unique = {...table, table: 'workbench_unique'};
		expect((await rpc(page, 'queryWorkbenchTable', unique)).edit.keyColumns).toEqual(['code']);
		expect(await rpc(page, 'queryWorkbenchUpdateRow', {
			...unique, key: {code: 'one'}, column: 'label', value: '', original: 'first unique'
		})).toEqual({affectedRows: 1});
		expect((await execute(page, fixture, 'SELECT label FROM workbench_unique ORDER BY code')).results[0].rows)
			.toEqual([[''], ['second unique']]);

		const missingTarget = engine === 'sqlite'
			? `/persist/query-workbench-missing-${randomUUID()}.sqlite`
			: `idb://query-workbench-missing-${randomUUID()}`;
		const databasesBefore = await page.evaluate(() => indexedDB.databases());
		await expect(execute(page, {...fixture, target: missingTarget}, 'SELECT 1')).rejects.toThrow();
		if(engine === 'sqlite')
		{
			expect((await rpc(page, 'analyzePath', missingTarget)).exists).toBe(false);
		}
		else
		{
			const databasesAfter = await page.evaluate(() => indexedDB.databases());
			expect(databasesAfter.map(database => database.name).sort())
				.toEqual(databasesBefore.map(database => database.name).sort());
		}
	});
}
