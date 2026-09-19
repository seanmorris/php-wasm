import fs from 'node:fs/promises';
import {test, expect} from '@playwright/test';

test.skip(!process.env.DEMO_WEB_ARTIFACT_ROOT, 'Requires the built demo-web artifact.');
test.use({actionTimeout: 20000});

/**
 * Exercise the same service-worker action used by the UI, without exposing test globals.
 * @param {object} page Playwright page.
 * @param {string} action Worker action name.
 * @param {...unknown} params Action arguments; byte arrays are restored before writes.
 * @returns {Promise<unknown>} Worker response.
 */
const rpc = (page, action, ...params) => page.evaluate(({action, params}) => new Promise((resolve, reject) => {
	if(action === 'writeFile' && Array.isArray(params[1])) params[1] = new Uint8Array(params[1]);
	const token = crypto.randomUUID();
	const listener = event => {
		if(event.data?.re !== token) return;
		clearTimeout(timer);
		navigator.serviceWorker.removeEventListener('message', listener);
		if(event.data.error) reject(new Error(event.data.error.message));
		else resolve(event.data.result);
	};
	const timer = setTimeout(() => {
		navigator.serviceWorker.removeEventListener('message', listener);
		reject(new Error('Worker did not reply to ' + action));
	}, 60000);
	navigator.serviceWorker.addEventListener('message', listener);
	navigator.serviceWorker.controller.postMessage({action, token, params});
}), {action, params});

const start = async page => {
	await page.goto('code-editor.html');
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 60000}).toBe(true);
	await rpc(page, 'runtimeReady');
	await expect(page.getByText('Draft recovery saved', {exact: true})).toBeVisible();
};
const open = async (page, path) => {
	await page.getByText('File', {selector: 'summary', exact: true}).click();
	await page.getByRole('button', {name: 'Open by path…'}).click();
	const dialog = page.getByRole('dialog', {name: 'Open file by path'});
	await dialog.getByRole('textbox').fill(path);
	await dialog.getByRole('button', {name: 'Continue'}).click();
	await expect(page.getByRole('tab', {selected: true})).toHaveAttribute('title', path);
	await expect(page.getByRole('button', {name: 'Save file', exact: true})).toBeEnabled();
};
const edit = async (page, contents) => {
	await page.locator('#edit-root .ace_content').click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.insertText(contents);
};
const disk = async (page, path) => {
	const result = await rpc(page, 'readFile', path);
	return typeof result === 'string' ? result : new TextDecoder().decode(Uint8Array.from(Object.values(result)));
};

test('CGI serves an uploaded Phar application and its internal files', async ({page}) => {
	await start(page);
	const archive = await fs.readFile(new URL('../../packages/phar/test/fixtures/webapp.phar', import.meta.url));
	await rpc(page, 'writeFile', '/persist/webapp.phar', [...archive]);
	const prefix = '/php-wasm/cgi-bin/phar-test';
	await rpc(page, 'setSettings', {vHosts: [{pathPrefix: prefix, directory: '/persist', entrypoint: 'webapp.phar'}]});

	const results = await page.evaluate(async prefix => {
		const redirected = await fetch(`${prefix}/webapp.phar`);
		const index = await fetch(`${prefix}/webapp.phar/index.php?value=1`);
		const asset = await fetch(`${prefix}/webapp.phar/hello.txt`);
		const fallback = await fetch(`${prefix}/hello.txt`);
		const missing = await fetch(`${prefix}/webapp.phar/missing.txt`);
		return {
			redirected: {status: redirected.status, url: redirected.url}
			, index: {status: index.status, body: await index.json()}
			, asset: {status: asset.status, body: await asset.text()}
			, fallback: {status: fallback.status, body: await fallback.text()}
			, missing: missing.status
		};
	}, prefix);
	expect(results.redirected.status).toBe(200);
	expect(new URL(results.redirected.url).pathname).toBe(`${prefix}/webapp.phar/index.php`);
	expect(results.index.status).toBe(200);
	expect(results.index.body).toEqual({path: '/index.php', query: {value: '1'}});
	expect(results.asset).toEqual({status: 200, body: 'web asset\n'});
	expect(results.fallback).toEqual({status: 200, body: 'web asset\n'});
	expect(results.missing).toBe(404);
});

/**
 * Produces small ZIP fixtures, including inventories a safe importer must reject.
 * @param {Array<{name: string, data?: string, size?: number, mode?: number}>} entries Archive members.
 * @returns {Buffer} Encoded ZIP bytes.
 */
const zipFixture = entries => {
	const local = [], central = [];
	let offset = 0;
	for(const entry of entries)
	{
		const name = Buffer.from(entry.name);
		const bytes = Buffer.from(entry.data || '');
		let crc = 0xffffffff;
		for(const byte of bytes)
		{
			crc ^= byte;
			for(let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
		crc = (crc ^ 0xffffffff) >>> 0;
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0x800, 6);
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(bytes.length, 18);
		header.writeUInt32LE(entry.size ?? bytes.length, 22);
		header.writeUInt16LE(name.length, 26);
		local.push(header, name, bytes);
		const directory = Buffer.alloc(46);
		directory.writeUInt32LE(0x02014b50);
		directory.writeUInt16LE((3 << 8) | 20, 4);
		header.copy(directory, 6, 4, 30);
		directory.writeUInt32LE(((entry.mode ?? 0o100644) * 65536) >>> 0, 38);
		directory.writeUInt32LE(offset, 42);
		central.push(directory, name);
		offset += header.length + name.length + bytes.length;
	}
	const tail = Buffer.alloc(22);
	tail.writeUInt32LE(0x06054b50);
	tail.writeUInt16LE(entries.length, 8);
	tail.writeUInt16LE(entries.length, 10);
	tail.writeUInt32LE(central.reduce((sum, item) => sum + item.length, 0), 12);
	tail.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, ...central, tail]);
};

test('explicit save persists across a worker restart, while draft recovery leaves PHP files alone', async ({page, context}) => {
	await start(page);
	await rpc(page, 'writeFile', '/persist/editor.php', '<?php echo "original";');
	await open(page, '/persist/editor.php');
	await edit(page, '<?php echo "draft";');
	await expect(page.getByRole('tab', {selected: true})).toContainText('*');
	await page.waitForTimeout(700);
	expect(await disk(page, '/persist/editor.php')).toContain('original');
	page.on('dialog', dialog => dialog.accept());
	await page.reload();
	const recover = page.getByRole('dialog', {name: 'Recover unsaved drafts?'});
	await expect(recover).toBeVisible();
	await recover.getByRole('button', {name: 'Recover drafts', exact: true}).click();
	await expect(page.locator('#edit-root')).toContainText('draft');
	expect(await disk(page, '/persist/editor.php')).toContain('original');
	await page.getByRole('button', {name: 'Save file', exact: true}).click();
	await expect(page.getByRole('tab', {selected: true})).not.toContainText('*');
	expect(await disk(page, '/persist/editor.php')).toContain('draft');
	const cdp = await context.newCDPSession(page);
	let versionId;
	cdp.on('ServiceWorker.workerVersionUpdated', event => {
		versionId = event.versions.find(version => version.scriptURL.endsWith('/cgi-worker.js') && version.status === 'activated')?.versionId || versionId;
	});
	await cdp.send('ServiceWorker.enable');
	await expect.poll(() => versionId).toBeTruthy();
	await cdp.send('ServiceWorker.stopWorker', {versionId});
	expect(await disk(page, '/persist/editor.php')).toContain('draft');
	await cdp.detach();
});

test('a second window causes a checked conflict without overwriting either buffer', async ({page, context}) => {
	await start(page);
	await rpc(page, 'writeFile', '/persist/concurrent.php', 'initial');
	await open(page, '/persist/concurrent.php');
	await edit(page, 'first window');
	const other = await context.newPage();
	await start(other);
	await open(other, '/persist/concurrent.php');
	await edit(other, 'second window');
	await other.getByRole('button', {name: 'Save file', exact: true}).click();
	await expect(other.getByRole('tab', {selected: true})).not.toContainText('*');
	await page.getByRole('button', {name: 'Save file', exact: true}).click();
	const conflict = page.getByRole('dialog', {name: 'File changed on disk'});
	await expect(conflict).toBeVisible();
	await conflict.getByRole('button', {name: 'Cancel'}).click();
	expect(await disk(page, '/persist/concurrent.php')).toBe('second window');
	await expect(page.locator('#edit-root')).toContainText('first window');
	await page.getByRole('button', {name: 'Save file', exact: true}).click();
	await conflict.getByRole('button', {name: 'Overwrite disk version'}).click();
	await expect(page.getByRole('tab', {selected: true})).not.toContainText('*');
	expect(await disk(page, '/persist/concurrent.php')).toBe('first window');
});

test('uploads and downloads binary bytes, exports a folder and imports its ZIP into a selected folder', async ({page}) => {
	await start(page);
	await rpc(page, 'mkdir', '/persist/transfer');
	await rpc(page, 'mkdir', '/persist/roundtrip');
	await page.getByRole('button', {name: 'Root…'}).click();
	await page.getByRole('dialog').getByRole('textbox').fill('/persist/transfer');
	await page.getByRole('dialog').getByRole('button', {name: 'Continue'}).click();
	const bytes = Buffer.from([0, 128, 255, 1, 2, 3]);
	const uploadChooser = page.waitForEvent('filechooser');
	await page.getByRole('button', {name: 'Upload…', exact: true}).click();
	await (await uploadChooser).setFiles({name: 'binary.dat', mimeType: 'application/octet-stream', buffer: bytes});
	await expect(page.getByRole('button', {name: 'binary.dat', exact: true})).toBeVisible();
	await page.getByRole('button', {name: 'binary.dat', exact: true}).click();
	await expect(page.getByText('Binary or unsupported text encoding.', {exact: false})).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', {name: 'Download original file'}).click();
	expect(await fs.readFile(await (await downloadPromise).path())).toEqual(bytes);
	await page.getByText('File', {selector: 'summary', exact: true}).click();
	const zipDownload = page.waitForEvent('download', {timeout: 120000});
	await page.getByRole('button', {name: 'Export folder as ZIP'}).click();
	const zip = await zipDownload;
	await expect(page.getByRole('button', {name: 'Root…'})).toBeEnabled();
	await page.getByRole('button', {name: 'Root…'}).click();
	await page.getByRole('dialog').getByRole('textbox').fill('/persist/roundtrip');
	await page.getByRole('dialog').getByRole('button', {name: 'Continue'}).click();
	// Opening the picker captures the current folder before the browser supplies a file.
	await page.getByText('File', {selector: 'summary', exact: true}).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', {name: 'Import ZIP…'}).click();
	await (await chooser).setFiles(await zip.path());
	await expect.poll(async () => (await rpc(page, 'analyzePath', '/persist/roundtrip/binary.dat')).exists, {timeout: 120000}).toBe(true);
	const result = await rpc(page, 'readFile', '/persist/roundtrip/binary.dat');
	expect(Buffer.from(Object.values(result))).toEqual(bytes);
});

test('tree, tabs and dialogs are keyboard reachable on a narrow viewport', async ({page}) => {
	await page.setViewportSize({width: 390, height: 740});
	await start(page);
	await rpc(page, 'mkdir', '/persist/one');
	await rpc(page, 'mkdir', '/persist/two');
	await rpc(page, 'writeFile', '/persist/one/same.php', 'one');
	await rpc(page, 'writeFile', '/persist/two/same.php', 'two');
	await open(page, '/persist/one/same.php');
	await open(page, '/persist/two/same.php');
	const active = page.getByRole('tab', {selected: true});
	await expect(active).toContainText('/persist/two/same.php');
	await active.focus();
	await active.press('ArrowLeft');
	await expect(page.getByRole('tab', {selected: true})).toContainText('/persist/one/same.php');
	await page.getByRole('button', {name: 'Quick open…'}).click();
	await expect(page.getByRole('dialog', {name: 'Quick open'}).getByRole('textbox')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', {name: 'Quick open…'})).toBeFocused();
	expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
	await page.getByRole('button', {name: 'Toggle explorer'}).click();
	await expect(page.getByRole('complementary', {name: 'File explorer'})).toBeHidden();
});

test('rejects a whole unsafe ZIP inventory before creating destination files', async ({page}) => {
	await start(page);
	await rpc(page, 'mkdir', '/persist/zip-target');
	await page.getByRole('button', {name: 'Root…'}).click();
	await page.getByRole('dialog').getByRole('textbox').fill('/persist/zip-target');
	await page.getByRole('dialog').getByRole('button', {name: 'Continue'}).click();
	const cases = [
		{entries: [{name: 'safe.txt', data: 'safe'}, {name: '../escape', data: 'bad'}], error: 'Unsafe ZIP path'}
		, {entries: [{name: 'link', data: '/config', mode: 0o120777}], error: 'symlink or special file'}
		, {entries: [{name: 'same'}, {name: 'same'}], error: 'Duplicate ZIP path'}
		, {entries: [{name: 'huge', size: 256 * 1024 * 1024 + 1}], error: 'Expanded ZIP exceeds'}
	];
	for(const fixture of cases)
	{
		await page.getByText('File', {selector: 'summary', exact: true}).click();
		const chooser = page.waitForEvent('filechooser');
		await page.getByRole('button', {name: 'Import ZIP…'}).click();
		await (await chooser).setFiles({name: 'unsafe.zip', mimeType: 'application/zip', buffer: zipFixture(fixture.entries)});
		await expect(page.getByRole('alert')).toContainText(fixture.error, {timeout: 60000});
		expect(await rpc(page, 'readdir', '/persist/zip-target')).toEqual(['.', '..']);
		await page.getByRole('button', {name: 'Dismiss', exact: true}).click();
	}
});

test('saves the initial untitled document with a URL-sensitive filename and hands the saved path to VSCode', async ({page}) => {
	await start(page);
	await expect(page.getByRole('tab')).toHaveCount(1);
	await expect(page.getByRole('tab', {selected: true})).toHaveText(/^Untitled \d+$/);
	await expect(page.getByRole('button', {name: 'Save file', exact: true})).toBeEnabled();
	await edit(page, '<?php echo "saved before navigation";');
	await page.getByRole('button', {name: 'Open in VSCode'}).click();
	await page.getByRole('dialog', {name: 'Unsaved changes'}).getByRole('button', {name: 'Save', exact: true}).click();
	const path = '/persist/résumé #?.php';
	await page.getByRole('dialog', {name: 'Save As'}).getByRole('textbox').fill(path);
	await page.getByRole('dialog').getByRole('button', {name: 'Continue'}).click();
	await expect(page).toHaveURL(new RegExp('/vscode.html\\?path='));
	expect(new URL(page.url()).searchParams.get('path')).toBe(path);
	expect(await disk(page, path)).toContain('saved before navigation');
});

test('runs the saved buffer in the existing PHP debugger', async ({page}) => {
	await start(page);
	await rpc(page, 'writeFile', '/persist/debug-editor.php', '<?php echo "old debugger output";');
	await open(page, '/persist/debug-editor.php');
	await edit(page, '<?php echo "editor debugger handoff";');
	await page.getByRole('button', {name: 'Start debugger'}).click();
	await page.getByRole('dialog', {name: 'Save before debugging?'}).getByRole('button', {name: 'Save and start'}).click();
	await expect(page.locator('.editor-debugger .phpdbg-console')).toContainText('editor debugger handoff', {timeout: 60000});
	expect(await disk(page, '/persist/debug-editor.php')).toContain('editor debugger handoff');
	await page.getByRole('button', {name: 'Stop debugger'}).click();
	await expect(page.getByRole('button', {name: 'Save file', exact: true})).toBeEnabled();
});

test('round trips an empty folder as a standard empty ZIP', async ({page}) => {
	await start(page);
	await rpc(page, 'mkdir', '/persist/empty');
	await page.getByRole('button', {name: 'Root…'}).click();
	await page.getByRole('dialog').getByRole('textbox').fill('/persist/empty');
	await page.getByRole('dialog').getByRole('button', {name: 'Continue'}).click();
	await page.getByText('File', {selector: 'summary', exact: true}).click();
	const download = page.waitForEvent('download', {timeout: 60000});
	await page.getByRole('button', {name: 'Export folder as ZIP'}).click();
	const zip = await download;
	expect(await fs.readFile(await zip.path())).toEqual(zipFixture([]));
	await page.getByText('File', {selector: 'summary', exact: true}).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', {name: 'Import ZIP…'}).click();
	await (await chooser).setFiles(await zip.path());
	await expect(page.locator('.editor-status')).toHaveText('0 imported, 0 skipped.', {timeout: 60000});
});

test('preserves UTF-8 BOM and CRLF while requiring consent for a large text file', async ({page}) => {
	await start(page);
	await rpc(page, 'writeFile', '/persist/bom.php', '\uFEFF<?php\r\necho "original";\r\n');
	await open(page, '/persist/bom.php');
	await expect(page.getByRole('combobox', {name: 'Line endings'})).toHaveValue('windows');
	await expect(page.getByText('UTF-8 with BOM', {exact: true})).toBeVisible();
	await edit(page, '<?php\necho "edited";\n');
	await page.getByRole('button', {name: 'Save file', exact: true}).click();
	await expect(page.getByRole('tab', {selected: true})).not.toContainText('*');
	const bytes = await rpc(page, 'readFile', '/persist/bom.php');
	expect(Buffer.from(Object.values(bytes))).toEqual(Buffer.from('\uFEFF<?php\r\necho "edited";\r\n'));
	await rpc(page, 'writeFile', '/persist/large.txt', 'a'.repeat(2 * 1024 * 1024 + 1));
	await page.getByText('File', {selector: 'summary', exact: true}).click();
	await page.getByRole('button', {name: 'Open by path…'}).click();
	await page.getByRole('dialog').getByRole('textbox').fill('/persist/large.txt');
	await page.getByRole('dialog').getByRole('button', {name: 'Continue'}).click();
	const large = page.getByRole('dialog', {name: 'Open large file?'});
	await expect(large).toContainText('2.0 MiB');
	await large.getByRole('button', {name: 'Cancel'}).click();
	await expect(page.getByRole('tab', {selected: true})).toHaveAttribute('title', '/persist/bom.php');
});
