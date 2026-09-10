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

test('framework DB button opens its installed database like the IDE popup', async ({page}) => {
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const fixture = await createFixture(page, 'sqlite');
	const target = '/persist/laravel-11/database/database.sqlite';
	await rpc(page, 'mkdir', '/persist/laravel-11');
	await rpc(page, 'mkdir', '/persist/laravel-11/database');
	await rpc(page, 'rename', fixture.target, target);
	await page.goto('select-framework.html', {waitUntil: 'domcontentloaded'});
	const card = page.locator('.frameworks .column', {has: page.getByRole('img', {name: 'laravel 11', exact: true})});
	const db = card.getByRole('button', {name: 'DB', exact: true});
	await expect(db).toBeVisible({timeout: 180000});
	const form = db.locator('..');
	await expect(form).toHaveAttribute('action', new URL('/php-wasm/query-workbench.html', page.url()).href);
	await expect(form).toHaveAttribute('method', 'get');
	await expect(form).toHaveAttribute('target', '_blank');
	await expect(form).toHaveAttribute('rel', 'opener');
	expect(await form.evaluate(form => Object.fromEntries(new FormData(form)))).toEqual({engine: 'sqlite', target, connect: '1'});
	const [popup] = await Promise.all([page.waitForEvent('popup'), db.click()]);
	try
	{
		await popup.waitForURL(/\/php-wasm\/query-workbench\.html\?/, {waitUntil: 'domcontentloaded'});
		await expect(popup).toHaveURL(/\/php-wasm\/query-workbench\.html\?/);
		await expect(popup.getByRole('button', {name: 'Run', exact: true})).toBeEnabled({timeout: 180000});
		await expect(popup.getByRole('textbox', {name: 'SQLite database path'})).toHaveValue(target);
		const table = popup.locator('.schema-tree summary').filter({hasText: /^workbench_fixture$/});
		await expect(table).toBeVisible();
		await expect(table).toHaveAttribute('title', /main\.workbench_fixture/);
		await expect(popup.getByRole('table', {name: 'Query result 1'})).toHaveCount(0);
	}
	finally
	{
		await popup.close();
	}
});

test('query workbench keeps native disclosure markers beside wrapping table names', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const fixture = await createFixture(page, 'sqlite');
	const name = 'workbench table with a very long name '.repeat(5).trim();
	await execute(page, fixture, `CREATE TABLE "${name}" (id INTEGER PRIMARY KEY)`);
	await connect(page, fixture);
	const summary = page.locator('.schema-tree summary').filter({hasText: name});
	const details = summary.locator('..');
	const short = page.locator('.schema-tree summary').filter({hasText: /^workbench_fixture$/});
	await expect(summary).toHaveText(name);
	await expect(summary).toHaveAttribute('title', `main.${name} (table)`);

	for(const viewport of [{width: 1280, height: 900}, {width: 390, height: 740}])
	{
		await page.setViewportSize(viewport);
		await summary.scrollIntoViewIfNeeded();
		const layout = await summary.evaluate(element => {
			const style = getComputedStyle(element);
			const sidebar = element.closest('.schema-panel');
			return {
				whiteSpace: style.whiteSpace, display: style.display
				, marker: style.listStyleType, markerPosition: style.listStylePosition
				, gutter: element.getBoundingClientRect().left - element.parentElement.getBoundingClientRect().left
				, fontSize: parseFloat(style.fontSize), overflowWrap: style.overflowWrap
				, sidebarOverflow: sidebar.scrollWidth - sidebar.clientWidth
				, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
			};
		});
		expect(layout).toMatchObject({
			whiteSpace: 'normal', display: 'list-item'
			, markerPosition: 'outside', overflowWrap: 'anywhere'
		});
		expect(layout.marker).not.toBe('none');
		expect(layout.gutter).toBeGreaterThanOrEqual(layout.fontSize - 0.5);
		expect(layout.sidebarOverflow).toBeLessThanOrEqual(1);
		expect(layout.pageOverflow).toBeLessThanOrEqual(1);
		expect((await summary.boundingBox()).height).toBeGreaterThan((await short.boundingBox()).height * 2);

		// The native marker gets its own gutter beside the first text line.
		// Wrapped summaries remain both pointer- and keyboard-operable.
		await expect(details).not.toHaveAttribute('open');
		await summary.click();
		await expect(details).toHaveAttribute('open', '');
		await expect(details.getByRole('button', {name: 'Select rows', exact: true})).toBeVisible();
		await summary.focus();
		await summary.press('Enter');
		await expect(details).not.toHaveAttribute('open');
		await summary.press('Enter');
		await expect(details).toHaveAttribute('open', '');
		await summary.click();
		await expect(details).not.toHaveAttribute('open');
	}
});

test('query workbench keeps mobile controls reachable without horizontal page overflow', async ({page}) => {
	await page.setViewportSize({width: 390, height: 740});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	await expect(page.getByRole('combobox', {name: 'Database engine'})).toBeVisible();
	const toggle = page.getByRole('button', {name: 'Toggle schemas', exact: true});
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('complementary', {name: 'Database navigator'})).toBeHidden();
	await page.locator('#query-editor').scrollIntoViewIfNeeded();
	await expect(page.locator('#query-editor')).toBeVisible();
	await expect(page.getByRole('textbox', {name: 'SQL file path', exact: true})).toHaveCount(0);
	await page.getByRole('button', {name: 'Save SQL', exact: true}).click();
	const dialog = page.getByRole('dialog', {name: 'Save SQL', exact: true});
	await expect(dialog.getByRole('textbox', {name: 'SQL file path', exact: true})).toBeVisible();
	const dialogBounds = await dialog.boundingBox();
	expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
	expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(390);
	await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
	await expect(dialog).toHaveCount(0);
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

test('query workbench saves and loads SQL through transient file dialogs', async ({page}) => {
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const path = `/persist/workbench-modal-${randomUUID()}.sql`;
	const sql = "SELECT 'saved café 🚀' AS saved_value;\n-- modal round trip";
	await page.locator('#query-editor').click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.insertText(sql);
	await expect(page.getByRole('textbox', {name: 'SQL file path', exact: true})).toHaveCount(0);
	await page.getByRole('button', {name: 'Save SQL', exact: true}).click();
	const saveDialog = page.getByRole('dialog', {name: 'Save SQL', exact: true});
	await saveDialog.getByRole('textbox', {name: 'SQL file path', exact: true}).fill(path);
	await saveDialog.getByRole('button', {name: 'Save', exact: true}).click();
	await expect(saveDialog).toHaveCount(0);
	expect(await rpc(page, 'readFile', path, {encoding: 'utf8'})).toBe(sql);

	await rpc(page, 'refresh');
	await page.reload({waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	await expect(page.locator('#query-editor')).not.toContainText('saved café 🚀');
	await page.getByRole('button', {name: 'Load SQL', exact: true}).click();
	const loadDialog = page.getByRole('dialog', {name: 'Load SQL', exact: true});
	await loadDialog.getByRole('textbox', {name: 'SQL file path', exact: true}).fill(path);
	await loadDialog.getByRole('button', {name: 'Load', exact: true}).click();
	await expect(loadDialog).toHaveCount(0);
	await expect(page.locator('#query-editor')).toContainText('saved café 🚀');
	await expect(page.locator('#query-editor')).toContainText('-- modal round trip');
	await expect(page.getByRole('textbox', {name: 'SQL file path', exact: true})).toHaveCount(0);
	await expect(page.getByRole('table', {name: 'Query result 1'})).toHaveCount(0);
});

test('query workbench top controls adjoin and fill the hint toolbar height', async ({page}) => {
	await page.setViewportSize({width: 1600, height: 900});
	const query = new URLSearchParams({engine: 'pgsql', target: pgsqlTarget});
	await page.goto(`query-workbench.html?${query}`, {waitUntil: 'domcontentloaded'});
	const toolbar = page.locator('.workbench-toolbar');
	await expect(toolbar.getByRole('button', {name: 'Save SQL', exact: true})).toBeVisible();
	const buttonNames = ['Toggle schemas', '+ Query tab', 'Save SQL', 'Load SQL', 'Run'];
	await expect(toolbar.getByRole('button')).toHaveCount(buttonNames.length);
	const bounds = await toolbar.evaluate(element => {
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		const controls = [...element.querySelectorAll('button, select')].map(control => {
			const bounds = control.getBoundingClientRect();
			return {top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right};
		});
		return {
			top: rect.top + parseFloat(style.borderTopWidth)
			, bottom: rect.bottom - parseFloat(style.borderBottomWidth)
			, left: rect.left + parseFloat(style.borderLeftWidth)
			, rowLimitLeft: element.querySelector('label').getBoundingClientRect().left
			, controls
		};
	});
	expect(bounds.controls).toHaveLength(buttonNames.length + 1);
	for(const control of bounds.controls)
	{
		expect(Math.abs(control.top - bounds.top)).toBeLessThan(0.5);
		expect(Math.abs(control.bottom - bounds.bottom)).toBeLessThan(0.5);
	}
	expect(Math.abs(bounds.controls[0].left - bounds.left)).toBeLessThan(0.5);
	for(let index = 1; index < buttonNames.length; index++)
	{
		expect(Math.abs(bounds.controls[index].left - bounds.controls[index - 1].right)).toBeLessThan(0.5);
	}
	expect(Math.abs(bounds.rowLimitLeft - bounds.controls[buttonNames.length - 1].right)).toBeLessThan(0.5);
	for(const [index, name] of buttonNames.entries())
	{
		await expect(toolbar.getByRole('button').nth(index)).toHaveAccessibleName(name);
	}
	await expect(toolbar.locator('button, select').last()).toHaveAccessibleName('Row limit');

	const connection = page.locator('.query-connection-strip > span');
	await expect(connection).toHaveCount(2);
	await expect(connection.last()).toHaveText(pgsqlTarget);
	const alignment = await connection.evaluateAll(spans => spans.map(span => {
		const rect = span.getBoundingClientRect();
		const range = document.createRange();
		range.selectNodeContents(span);
		const text = range.getBoundingClientRect();
		return {top: rect.top, bottom: rect.bottom, textTop: text.top, textBottom: text.bottom};
	}));
	for(const edge of ['top', 'bottom', 'textTop', 'textBottom'])
	{
		expect(Math.abs(alignment[0][edge] - alignment[1][edge])).toBeLessThan(0.5);
	}
});

test('query workbench toggles wide results between wrapping and horizontal scrolling', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const fixture = await createFixture(page, 'sqlite');
	await connect(page, fixture);
	const longValue = 'wide-result-value-'.repeat(30);
	const columns = Array.from({length: 6}, (_, index) => `'${longValue}' AS wide_column_${index + 1}`);
	await runInEditor(page, `SELECT ${columns.join(', ')}`);
	const table = page.getByRole('table', {name: 'Query result 1'});
	await expect(table.getByRole('columnheader')).toHaveCount(7);
	const toggle = page.getByRole('checkbox', {name: 'Horizontal scroll', exact: true});
	const scroller = page.locator('.result-scroll');
	const overflowWidth = () => scroller.evaluate(element => element.scrollWidth - element.clientWidth);
	await expect(toggle).toBeChecked();
	await expect.poll(overflowWidth).toBeGreaterThan(200);
	const unwrappedHeight = (await table.locator('tbody td').first().boundingBox()).height;
	await scroller.evaluate(element => {element.scrollLeft = 150;});
	await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);

	await toggle.uncheck();
	await expect(toggle).not.toBeChecked();
	await expect.poll(overflowWidth).toBeLessThanOrEqual(1);
	await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBe(0);
	// Wrapping must remove the overflow rather than merely hide its scrollbar.
	await scroller.evaluate(element => {element.scrollLeft = 150;});
	expect(await scroller.evaluate(element => element.scrollLeft)).toBe(0);
	const wrappedHeight = (await table.locator('tbody td').first().boundingBox()).height;
	expect(wrappedHeight).toBeGreaterThan(unwrappedHeight);
	expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

	await toggle.check();
	await expect(toggle).toBeChecked();
	await expect.poll(overflowWidth).toBeGreaterThan(200);
	expect((await table.locator('tbody td').first().boundingBox()).height).toBeLessThan(wrappedHeight);
	await scroller.evaluate(element => {element.scrollLeft = 150;});
	await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('query workbench editable cells respond throughout their padding and tall-row corners', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 1000});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const fixture = await createFixture(page, 'sqlite');
	await execute(page, fixture, 'CREATE TABLE workbench_click_targets (id INTEGER PRIMARY KEY, label TEXT, detail TEXT)');
	await execute(page, fixture, `INSERT INTO workbench_click_targets VALUES
		(1, 'first field', 'line 1\nline 2\nline 3\nline 4\nline 5'),
		(2, 'second field', 'short neighbor')`);
	await connect(page, fixture);
	await page.locator('.schema-tree summary').filter({hasText: /^workbench_click_targets$/}).click();
	await page.getByRole('button', {name: 'Select rows', exact: true}).click();
	const button = page.getByRole('button', {name: 'Edit row 1 label', exact: true});
	const cell = button.locator('..');
	const drawer = page.getByRole('form', {name: 'Edit row', exact: true});
	await expect(button).toBeVisible();
	expect((await cell.boundingBox()).height).toBeGreaterThan((await button.boundingBox()).height + 40);

	for(const [horizontal, vertical] of [[0, 0], [1, 0], [1, 1], [0, 1]])
	{
		await cell.scrollIntoViewIfNeeded();
		const bounds = await cell.boundingBox();
		// Real pointer events near each cell edge, outside the button's text box.
		await page.mouse.click(
			bounds.x + (horizontal ? bounds.width - 3 : 3)
			, bounds.y + (vertical ? bounds.height - 3 : 3)
		);
		await expect(drawer.getByRole('textbox', {name: 'Cell value', exact: true})).toHaveValue('first field');
		await expect(drawer.locator('.row-edit-field')).toContainText('Row 1 · label');
		await drawer.getByRole('button', {name: 'Cancel edit', exact: true}).click();
		await expect(drawer).toHaveCount(0);
	}

	await button.click();
	const other = page.getByRole('button', {name: 'Edit row 2 label', exact: true});
	await expect(other).toBeDisabled();
	await other.locator('..').scrollIntoViewIfNeeded();
	const otherBounds = await other.locator('..').boundingBox();
	await page.mouse.click(otherBounds.x + 3, otherBounds.y + otherBounds.height - 3);
	await expect(drawer.getByRole('textbox', {name: 'Cell value', exact: true})).toHaveValue('first field');
	await expect(drawer.locator('.row-edit-field')).toContainText('Row 1 · label');
	await drawer.getByRole('button', {name: 'Cancel edit', exact: true}).click();
	await expect(other).toBeEnabled();
});

test('query workbench field drawer spans the results box and stays usable on mobile', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const fixture = await createFixture(page, 'sqlite');
	await connect(page, fixture);
	await expect(page.getByRole('complementary', {name: 'Database navigator'})).toBeVisible();
	await page.locator('.schema-tree summary').filter({hasText: /^workbench_fixture$/}).click();
	await page.getByRole('button', {name: 'Select rows', exact: true}).click();
	const cell = page.getByRole('button', {name: 'Edit row 1 label', exact: true});
	await cell.click();
	const drawer = page.getByRole('form', {name: 'Edit row', exact: true});
	const value = drawer.getByRole('textbox', {name: 'Cell value', exact: true});
	const assertFullWidth = async () => {
		await expect(page.locator('.query-results > .row-edit')).toHaveCount(1);
		const bounds = await drawer.evaluate(form => {
			const drawer = form.getBoundingClientRect();
			const style = getComputedStyle(form);
			const parent = form.parentElement;
			const results = parent.getBoundingClientRect();
			const parentStyle = getComputedStyle(parent);
			const toolbar = parent.querySelector('.result-toolbar').getBoundingClientRect();
			const input = form.querySelector('input:not([type="checkbox"])').getBoundingClientRect();
			return {
				left: drawer.left, right: drawer.right, bottom: drawer.bottom
				, resultsLeft: results.left + parseFloat(parentStyle.borderLeftWidth) + parseFloat(parentStyle.paddingLeft)
				, resultsRight: results.right - parseFloat(parentStyle.borderRightWidth) - parseFloat(parentStyle.paddingRight)
				, toolbarTop: toolbar.top
				, inputLeft: input.left, inputRight: input.right, inputBottom: input.bottom
				, innerLeft: drawer.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
				, innerRight: drawer.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
				, controlsTop: [...form.querySelectorAll('button, input[type="checkbox"]')].map(control => control.getBoundingClientRect().top)
			};
		});
		expect(Math.abs(bounds.left - bounds.resultsLeft)).toBeLessThan(0.5);
		expect(Math.abs(bounds.right - bounds.resultsRight)).toBeLessThan(0.5);
		expect(bounds.toolbarTop).toBeGreaterThanOrEqual(bounds.bottom);
		expect(Math.abs(bounds.inputLeft - bounds.innerLeft)).toBeLessThan(0.5);
		expect(Math.abs(bounds.inputRight - bounds.innerRight)).toBeLessThan(0.5);
		for(const top of bounds.controlsTop) expect(top).toBeGreaterThanOrEqual(bounds.inputBottom);
	};
	await assertFullWidth();
	await drawer.getByRole('checkbox', {name: 'Set NULL', exact: true}).check();
	await expect(value).toBeDisabled();
	await drawer.getByRole('checkbox', {name: 'Set NULL', exact: true}).uncheck();
	await value.fill('cancelled drawer edit');
	await drawer.getByRole('button', {name: 'Cancel edit', exact: true}).click();
	await expect(drawer).toHaveCount(0);
	expect((await fetchFixture(page, fixture))[0].label).toBe('seed;value');

	await cell.click();
	await page.setViewportSize({width: 390, height: 740});
	await drawer.scrollIntoViewIfNeeded();
	await assertFullWidth();
	expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
	const updated = `full-width drawer café 🚀 ${'value '.repeat(40)}`;
	await value.fill(updated);
	await drawer.getByRole('button', {name: 'Save row', exact: true}).click();
	await expect(drawer).toHaveCount(0);
	expect((await fetchFixture(page, fixture))[0].label).toBe(updated);
	await expect.poll(() => page.locator('.result-scroll').evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('query workbench keeps bottom result controls anchored while dragging editor height', async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const slider = page.getByRole('slider', {name: 'Editor height', exact: true});
	await expect(slider).toBeVisible();
	const toolbar = page.locator('.result-toolbar');
	const editor = page.locator('.sql-editor');

	for(const panel of ['Result Grid', 'Action Output'])
	{
		await page.getByRole('button', {name: new RegExp(`^${panel}`)}).click();
		expect(await toolbar.evaluate(element => {
			const style = getComputedStyle(element);
			return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
		})).toEqual(['2px', '0px', '0px', '0px']);
		const content = page.locator(panel === 'Result Grid' ? '.result-scroll' : '.action-output');
		const initial = await toolbar.boundingBox();
		const range = await slider.boundingBox();
		const y = range.y + range.height / 2;
		const initialValue = Number(await slider.inputValue());
		await page.mouse.move(range.x + 8 + (range.width - 16) * (initialValue - 20) / 60, y);
		await page.mouse.down();
		try
		{
			for(const fraction of [0.1, 0.9, 0.3, 0.7])
			{
				const previousHeight = (await editor.boundingBox()).height;
				await page.mouse.move(range.x + 8 + (range.width - 16) * fraction, y, {steps: 5});
				await expect.poll(async () => Math.abs((await editor.boundingBox()).height - previousHeight)).toBeGreaterThan(10);
				const currentRange = await slider.boundingBox();
				const currentToolbar = await toolbar.boundingBox();
				const currentContent = await content.boundingBox();
				expect(Math.abs(currentRange.y + currentRange.height / 2 - y)).toBeLessThan(0.5);
				expect(Math.abs(currentToolbar.y + currentToolbar.height - initial.y - initial.height)).toBeLessThan(0.5);
				expect(currentContent.y + currentContent.height).toBeLessThanOrEqual(currentToolbar.y + 0.5);
			}
		}
		finally
		{
			await page.mouse.up();
		}
	}
});

const testStickyHeaderCoverage = async ({page}) => {
	await page.setViewportSize({width: 1280, height: 900});
	await page.goto('query-workbench.html', {waitUntil: 'domcontentloaded'});
	await waitForWorker(page);
	const fixture = await createFixture(page, 'sqlite');
	await execute(page, fixture, `
		WITH RECURSIVE numbers(id) AS (
			VALUES (4) UNION ALL SELECT id + 1 FROM numbers WHERE id < 80
		)
		INSERT INTO workbench_fixture (id, label)
		SELECT id, 'scroll row ' || id FROM numbers
	`);
	await connect(page, fixture);
	await page.locator('.schema-tree summary').filter({hasText: /^workbench_fixture$/}).click();
	await page.getByRole('button', {name: 'Select rows', exact: true}).click();
	const table = page.getByRole('table', {name: 'Query result 1'});
	const cell = table.getByRole('button', {name: 'Edit row 3 label', exact: true});
	await expect(table.getByRole('button', {name: /^Edit row \d+ label$/})).toHaveCount(80);
	const scroller = page.locator('.result-scroll');
	expect(await scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);

	const scrollCellUnderHeader = async () => {
		await cell.evaluate(button => {
			const table = button.closest('table');
			const scroller = table.closest('.result-scroll');
			const header = table.querySelectorAll('thead th')[button.closest('td').cellIndex];
			const buttonRect = button.getBoundingClientRect();
			const headerCenter = scroller.getBoundingClientRect().top + scroller.clientTop
				+ header.getBoundingClientRect().height / 2;
			scroller.scrollTop += buttonRect.top + buttonRect.height / 2 - headerCenter;
		});
		await expect.poll(() => cell.evaluate(button => {
			const table = button.closest('table');
			const header = table.querySelectorAll('thead th')[button.closest('td').cellIndex];
			const buttonRect = button.getBoundingClientRect();
			const headerRect = header.getBoundingClientRect();
			const x = buttonRect.left + buttonRect.width / 2;
			const y = buttonRect.top + buttonRect.height / 2;
			return {
				scrolled: table.closest('.result-scroll').scrollTop > 0
				, overlapsHeader: x > headerRect.left && x < headerRect.right
					&& y > headerRect.top && y < headerRect.bottom
				// Hit testing checks the browser's real paint order, not a CSS value.
				, headerOnTop: document.elementFromPoint(x, y)?.closest('th') === header
			};
		})).toEqual({scrolled: true, overlapsHeader: true, headerOnTop: true});
	};

	await scrollCellUnderHeader();
	// Offset from a row boundary so a coincident body border cannot hide a gap.
	await scroller.evaluate(element => {element.scrollTop += 4;});
	const readHeaderEdge = async () => page.evaluate(async screenshot => {
		const image = new Image();
		image.src = `data:image/png;base64,${screenshot}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d');
		context.drawImage(image, 0, 0);
		const scroller = document.querySelector('.result-scroll');
		const y = Math.floor((scroller.getBoundingClientRect().top + scroller.clientTop) * devicePixelRatio);
		return [...scroller.querySelectorAll('thead th')].map(header => {
			const rect = header.getBoundingClientRect();
			const x = Math.ceil((rect.left + 1) * devicePixelRatio);
			const width = Math.floor((rect.width - 2) * devicePixelRatio);
			return Array.from(context.getImageData(x, y, width, Math.ceil(devicePixelRatio)).data);
		});
	}, (await page.screenshot()).toString('base64'));
	// Changing only cells hidden below the header must not change its first
	// physical pixel row(s), including at fractional CSS-pixel scrollport edges.
	const bodyColor = await page.addStyleTag({content: '.query-results tbody th, .query-results tbody td { background: #f0f; }'});
	try
	{
		const before = await readHeaderEdge();
		await bodyColor.evaluate(style => {style.textContent = '.query-results tbody th, .query-results tbody td { background: #0ff; }';});
		expect(await readHeaderEdge()).toEqual(before);
	}
	finally
	{
		await bodyColor.evaluate(style => style.remove());
	}
	await scroller.evaluate(element => {element.scrollTop = 0;});
	await cell.scrollIntoViewIfNeeded();
	const bounds = await cell.boundingBox();
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.down();
	try
	{
		await expect.poll(() => cell.evaluate(button => button.matches(':active'))).toBe(true);
		await scrollCellUnderHeader();
		await expect.poll(() => cell.evaluate(button => button.matches(':active'))).toBe(true);
	}
	finally
	{
		await page.mouse.move(0, 0);
		await page.mouse.up();
	}
};

for(const deviceScaleFactor of [1, 2])
{
	test.describe(`query workbench at ${deviceScaleFactor}x pixel density`, () => {
		test.use({deviceScaleFactor});
		test('sticky headers cover scrolled editable cells, including pressed buttons', testStickyHeaderCoverage);
	});
}

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
			engine, target: fixture.target, connect: '1', sql: 'DELETE FROM workbench_fixture', autorun: 'true'
		});
		await page.goto(`query-workbench.html?${query}`, {waitUntil: 'domcontentloaded'});
		await waitForWorker(page);
		await expect(page.getByRole('button', {name: 'Run', exact: true})).toBeEnabled({timeout: 180000});

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

		await page.locator('.schema-tree summary').filter({hasText: /^workbench_fixture$/}).click();
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
