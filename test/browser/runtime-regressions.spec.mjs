import {test, expect} from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const variant = process.env.PHP_VARIANT ?? '';
const libType = process.env.LIB_TYPE ?? 'dynamic';

const initializeCgi = async page => {
	await page.goto(`harness/cgi.html?version=${version}&libType=${libType}`);
	await expect(page.locator('[data-testid="status"]')).toHaveText('done', {timeout: 120000});
	await page.evaluate(() => {
		let token = 0;
		const pending = new Map();
		window.cgiPaused = new Promise(resolve => window.resolveCgiPaused = resolve);
		navigator.serviceWorker.addEventListener('message', event => {
			if(event.data.phase === 'cgi-concurrency-paused') window.resolveCgiPaused();
			const operation = pending.get(event.data.re);
			if(!operation) return;
			pending.delete(event.data.re);
			clearTimeout(operation.timer);
			if(event.data.error) operation.reject(new Error(event.data.error.message));
			else operation.resolve(event.data.result);
		});
		window.cgiRpc = (action, params = []) => new Promise((resolve, reject) => {
			const id = ++token;
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`CGI ${action} timed out`));
			}, 30000);
			pending.set(id, {resolve, reject, timer});
			navigator.serviceWorker.controller.postMessage({action, params, token: id});
		});
	});
	await page.evaluate(async () => {
		if(!(await window.cgiRpc('analyzePath', ['/persist/www'])).exists)
		{
			await window.cgiRpc('mkdir', ['/persist/www']);
		}
	});
};

test('CGI preserves PHP and RPC writes across suspension and worker refresh', async ({page}) => {
	await initializeCgi(page);
	await page.evaluate(() => window.cgiRpc('writeFile', [
		'/persist/www/overlap.php'
		, `<?php
		file_put_contents('/persist/www/from-php.txt', 'kept');
		$window = new Vrzno;
		vrzno_await($window->cgiConcurrencyPause());
		echo file_exists('/persist/www/from-php.txt') ? 'kept' : 'lost';
		`
	]));
	const requesting = page.evaluate(async () => {
		const response = await fetch('/php-wasm/cgi-bin/overlap.php');
		return {status: response.status, body: await response.text()};
	});
	await page.evaluate(() => window.cgiPaused);
	const writing = page.evaluate(async () => {
		window.rpcAcknowledged = false;
		await window.cgiRpc('writeFile', ['/persist/www/from-rpc.txt', 'rpc']);
		window.rpcAcknowledged = true;
	});
	// On the broken implementation the RPC finishes and deletes PHP's file.
	// On the corrected implementation it waits for PHP's filesystem lock.
	await page.waitForFunction(async () => window.rpcAcknowledged
		|| (await navigator.locks.query()).pending.some(lock => lock.name === 'php-wasm-fs-lock'));
	await page.evaluate(() => window.cgiRpc('resumeConcurrencyTest'));
	const [response] = await Promise.all([requesting, writing]);
	expect(response).toEqual({status: 200, body: 'kept'});
	await page.evaluate(() => window.cgiRpc('refresh'));
	const files = await page.evaluate(() => Promise.all([
		window.cgiRpc('readFile', ['/persist/www/from-php.txt', {encoding: 'utf8'}])
		, window.cgiRpc('readFile', ['/persist/www/from-rpc.txt', {encoding: 'utf8'}])
	]));
	expect(files).toEqual(['kept', 'rpc']);
});

test('concurrent CGI iframes receive their own freshly written files', async ({page}) => {
	await initializeCgi(page);
	const results = await page.evaluate(async () => {
		await Promise.all(Array.from({length: 6}, (_, index) => window.cgiRpc('mkdir', [`/persist/www/frame${index}`])));
		const results = [];
		for(let round = 0; round < 3; round++)
		{
			results.push(...await Promise.all(Array.from({length: 6}, async (_, index) => {
				const expected = `frame${index}-round${round}`;
				await window.cgiRpc('writeFile', [`/persist/www/frame${index}/index.php`, `<?php echo '${expected}';`]);
				const url = `/php-wasm/cgi-bin/frame${index}/index.php?round=${round}`;
				const response = await fetch(url, {method: 'HEAD', cache: 'no-store'});
				const frame = document.createElement('iframe');
				const loaded = new Promise(resolve => frame.onload = () => resolve(frame.contentDocument.body.textContent));
				frame.src = url;
				document.body.append(frame);
				const actual = await loaded;
				frame.remove();
				return {expected, actual, status: response.status};
			})));
		}
		return results;
	});
	for(const result of results)
	{
		expect(result.status).toBe(200);
		expect(result.actual).toBe(result.expected);
	}
});

test('CGI cookie deadlines and deletions survive worker refresh', async ({page}) => {
	await initializeCgi(page);
	const snapshot = await page.evaluate(async () => {
		await window.cgiRpc('writeFile', [
			'/persist/www/cookies.php'
			, `<?php
			if(isset($_GET['set'])) {
				setcookie('reload', 'keep', ['expires' => time() + 3600, 'path' => '/']);
			} elseif(isset($_GET['delete'])) {
				setcookie('reload', '', ['expires' => 1, 'path' => '/']);
			}
			echo $_COOKIE['reload'] ?? 'expired';
			`
		]);
		await fetch('/php-wasm/cgi-bin/cookies.php?set');
		return JSON.parse(await window.cgiRpc('readFile', ['/config/.cookies', {encoding: 'utf8'}]));
	});
	expect(snapshot.version).toBe(1);
	const deadline = snapshot.cookies.find(cookie => cookie.raw.startsWith('reload=')).expiresAt;
	await page.evaluate(() => window.cgiRpc('refresh'));
	const restored = await page.evaluate(async () => {
		const response = await fetch('/php-wasm/cgi-bin/cookies.php');
		return {
			body: await response.text()
			, snapshot: JSON.parse(await window.cgiRpc('readFile', ['/config/.cookies', {encoding: 'utf8'}]))
		};
	});
	expect(restored.body).toBe('keep');
	expect(restored.snapshot.cookies[0].expiresAt).toBe(deadline);
	await page.evaluate(deadline => window.cgiRpc('setCookieTestTime', [deadline]), deadline);
	expect(await page.evaluate(async () => (await fetch('/php-wasm/cgi-bin/cookies.php')).text())).toBe('expired');
	await page.evaluate(async () => {
		await window.cgiRpc('setCookieTestTime');
		await fetch('/php-wasm/cgi-bin/cookies.php?set');
		await fetch('/php-wasm/cgi-bin/cookies.php?delete');
		await window.cgiRpc('refresh');
	});
	expect(await page.evaluate(async () => (await fetch('/php-wasm/cgi-bin/cookies.php')).text())).toBe('expired');
});

test('browser PHP supports strict source and PHP objects as native fetch options', async ({page}) => {
	await page.goto('harness/index.html');
	const result = await page.evaluate(async ({version, variant, libType}) => {
		const {PhpWeb} = await import('/packages/php-wasm/PhpWeb.mjs');
		const {loadEmbeddedSharedLibs} = await import('/php-wasm/harness/runtime-libs.mjs');
		const php = new PhpWeb({version, variant, sharedLibs: loadEmbeddedSharedLibs(libType)});
		let output = '';
		php.addEventListener('output', event => output += event.detail.join(''));
		const status = await php.run('<?php declare(strict_types=1); echo "strict";');
		const options = await php.x`(object) ['method' => 'GET']`;
		const request = new Request(location.href, options);
		const response = await fetch(request);
		return {status, output, response: response.status, missing: options.headers === undefined};
	}, {version, variant, libType});
	expect(result).toEqual({status: 0, output: 'strict', response: 200, missing: true});
});

for(const order of ['legacy-first', 'php-first'])
{
	test(`PHP preserves another runtime's global buffer: ${order}`, async ({page}) => {
		await page.goto('harness/index.html');
		if(order === 'legacy-first') await page.addScriptTag({content: 'var buffer = new ArrayBuffer(16);'});
		const result = await page.evaluate(async ({version, variant, libType}) => {
			const before = Object.getOwnPropertyDescriptor(globalThis, 'buffer');
			const {PhpWeb} = await import('/packages/php-wasm/PhpWeb.mjs');
			const {loadEmbeddedSharedLibs} = await import('/php-wasm/harness/runtime-libs.mjs');
			const php = new PhpWeb({version, variant, sharedLibs: loadEmbeddedSharedLibs(libType)});
			const status = await php.run('<?php echo "ready";');
			const after = Object.getOwnPropertyDescriptor(globalThis, 'buffer');
			return {status, preserved: before?.value === after?.value && before?.get === after?.get && before?.configurable === after?.configurable};
		}, {version, variant, libType});
		expect(result).toEqual({status: 0, preserved: true});
		if(order === 'php-first') await page.addScriptTag({content: 'var buffer = new ArrayBuffer(16);'});
		expect(await page.evaluate(() => globalThis.buffer.byteLength)).toBe(16);
	});
}

for(const order of ['perl-first', 'php-first'])
{
	test(`PHP and WebPerl 0.09-beta both execute in one page: ${order}`, async ({page}) => {
		await page.goto('harness/index.html');
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		const startPerl = async () => {
			await page.addScriptTag({url: '/php-wasm/webperl/webperl.js'});
			await page.evaluate(() => new Promise(resolve => {
				window.perlOutput = '';
				Perl.noMountIdbfs = true;
				Perl.output = text => window.perlOutput += text;
				Perl.init(() => {
					Perl.start(['-e', '$|=1; print "perl-ready";']);
					resolve();
				});
			}));
		};
		const startPhp = () => page.evaluate(async ({version, variant, libType}) => {
			const {PhpWeb} = await import('/packages/php-wasm/PhpWeb.mjs');
			const {loadEmbeddedSharedLibs} = await import('/php-wasm/harness/runtime-libs.mjs');
			window.compatPhp = new PhpWeb({version, variant, sharedLibs: loadEmbeddedSharedLibs(libType)});
			window.phpOutput = '';
			window.compatPhp.addEventListener('output', event => window.phpOutput += event.detail.join(''));
			await window.compatPhp.run('<?php echo "php-ready";');
		}, {version, variant, libType});
		if(order === 'perl-first')
		{
			await startPerl();
			await startPhp();
		}
		else
		{
			await startPhp();
			await startPerl();
		}
		const result = await page.evaluate(async () => {
			Perl.eval('print "-again";');
			const status = await window.compatPhp.run('<?php echo "-again";');
			return {status, perl: window.perlOutput, php: window.phpOutput};
		});
		expect(result).toEqual({status: 0, perl: 'perl-ready-again', php: 'php-ready-again'});
		expect(errors).toEqual([]);
	});
}
