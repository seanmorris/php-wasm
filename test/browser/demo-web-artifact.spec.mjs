import { test, expect } from '@playwright/test';
import {expectDebuggerContained} from '../lib/debugger-layout.mjs';
import {getPlaywrightLaunchOptions} from '../lib/playwright-browser.mjs';

const version = process.env.PHP_VERSION ?? '8.4';

test.describe.configure({ mode: 'serial' });
test.use({launchOptions: {
	...getPlaywrightLaunchOptions().launchOptions
	, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
}});

test('home page uses the production base path', async ({ page }) => {
	await page.goto('home.html?no-service-worker', {waitUntil: 'domcontentloaded'});

	await expect(page).toHaveURL(/\/php-wasm\/home\.html\?no-service-worker$/);
	await expect(page.getByRole('heading', { name: 'Select a demo:' })).toBeVisible();
	await expect(page.locator('.home')).toHaveClass(/\bviewport-page\b/);

	const embeddedLink = page.getByRole('link', { name: /PHP Embedded Demo/ });
	const frameworkLink = page.getByRole('link', { name: /PHP CGI Demo/ });

	await expect(embeddedLink).toHaveAttribute(
		'href',
		'/php-wasm/embedded-php.html?demo=sdl-cube.php'
	);
	await expect(frameworkLink).toHaveAttribute('href', '/php-wasm/select-framework.html');

	const heightRules = await page.evaluate(() => {
		const bodyHeightRules = [];
		const duplicateViewportRules = [];
		const installerCardWidths = [];
		const installerMessageWrapRules = [];
		const viewportPageHeightRules = [];
		const fullscreenSelectors = new Set([
			'#root'
			, '.home'
			, '.Embedded'
			, '.dbg-preview'
			, '.editor'
			, '.install-demo'
			, '.select-framework'
			, '.Confirm'
		]);

		for(const sheet of document.styleSheets)
		{
			for(const rule of sheet.cssRules)
			{
				// Width-only and wrapping-only rules must reach their checks too.
				if(!(rule instanceof CSSStyleRule))
				{
					continue;
				}

				const selectors = rule.selectorText
					.split(',')
					.map(selector => selector.trim());

				if(selectors.includes('body') && rule.style.height)
				{
					bodyHeightRules.push(rule.style.height);
				}

				if(selectors.includes('.viewport-page') && rule.style.height)
				{
					viewportPageHeightRules.push(rule.style.height);
				}

				if(selectors.includes('.install-demo > .bevel') && rule.style.width)
				{
					installerCardWidths.push(rule.style.width);
				}

				if(selectors.includes('.install-demo h2') && rule.style.overflowWrap)
				{
					installerMessageWrapRules.push(rule.style.overflowWrap);
				}

				if(
					rule.style.height.includes('100dvh')
					&& selectors.some(selector => fullscreenSelectors.has(selector))
				) {
					duplicateViewportRules.push(rule.cssText);
				}
			}
		}

		return {
			bodyHeightRules
			, duplicateViewportRules
			, installerCardWidths
			, installerMessageWrapRules
			, viewportPageHeightRules
		};
	});

	// A 100vh body is taller than the 100dvh application while mobile browser
	// chrome is expanded, exposing a scrollable strip beneath the application.
	expect(heightRules.bodyHeightRules).toContain('100%');
	expect(heightRules.bodyHeightRules).not.toContain('100vh');
	expect(heightRules.viewportPageHeightRules).toHaveLength(1);
	expect(heightRules.viewportPageHeightRules[0]).toContain('--visual-viewport-height');
	expect(heightRules.duplicateViewportRules).toEqual([]);
	expect(heightRules.installerCardWidths).toHaveLength(1);
	expect(heightRules.installerCardWidths[0]).toContain('45rem');
	expect(heightRules.installerCardWidths[0]).toContain('100%');
	expect(heightRules.installerMessageWrapRules).toEqual(['anywhere']);
});

test('home demo query redirects into the embedded demo', async ({ page }) => {
	await page.goto(`home.html?demo=hello-world.php&version=${version}&no-service-worker`, {
		waitUntil: 'domcontentloaded'
	});

	await expect(page).toHaveURL(/\/php-wasm\/embedded-php\.html/, { timeout: 180000 });
	await expect(page).toHaveURL(new RegExp(`version=${version.replace('.', '\\.')}`), { timeout: 180000 });

	const outputFrame = page.locator('iframe').nth(1);

	await expect.poll(
		async () => (await outputFrame.getAttribute('srcdoc')) ?? '',
		{ timeout: 180000 }
	).toContain('Hello, World!');
});

test('embedded php hello world runs', async ({ page }) => {
	await page.goto(`embedded-php.html?demo=hello-world.php&version=${version}&extensionFlags=0&no-service-worker`, {
		waitUntil: 'domcontentloaded'
	});
	await expect(page.locator('.Embedded')).toHaveClass(/\bviewport-page\b/);

	const outputFrame = page.locator('iframe').nth(1);

	await expect.poll(
		async () => (await outputFrame.getAttribute('srcdoc')) ?? '',
		{ timeout: 180000 }
	).toContain('Hello, World!');
});

test.describe('SDL demo controls', () => {
	test('cube links reload from a fragment and its canvas fills the preview after resize', async ({page, context}) => {
		await page.goto(`embedded-php.html?demo=sdl-cube.php&version=${version}&no-service-worker`, {waitUntil: 'domcontentloaded'});
		await expect(page.locator('[data-sdl-status]')).toHaveText('Running · sound off', {timeout: 180000});
		const share = new URL(page.url());
		expect(share.searchParams.has('code')).toBe(false);
		expect(new URLSearchParams(share.hash.slice(1)).get('code')).toContain('SDL cube');
		expect(share.pathname.length + share.search.length).toBeLessThan(200);
		for(const viewport of [{width: 1280, height: 1000}, {width: 1000, height: 850}])
		{
			await page.setViewportSize(viewport);
			await expect.poll(() => page.locator('canvas').evaluate(canvas => {
				const box = canvas.parentElement.getBoundingClientRect();
				const rect = canvas.getBoundingClientRect();
				return Math.abs(rect.width - box.width) < 1 && Math.abs(rect.height - box.height) < 1
					&& canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight;
			})).toBe(true);
		}
		await page.locator('canvas').press('Escape');
		const copy = await context.newPage();
		const requests = [];
		copy.on('request', request => { if(request.isNavigationRequest()) requests.push(request.url()); });
		share.pathname = share.pathname.replace('embedded-php.html', 'home.html');
		await copy.goto(share.href, {waitUntil: 'domcontentloaded'});
		await expect(copy).toHaveURL(/\/embedded-php\.html/);
		await expect(copy.locator('[data-sdl-status]')).toHaveText('Running · sound off', {timeout: 180000});
		expect(requests.every(url => !new URL(url).searchParams.has('code') && !url.includes('#code='))).toBe(true);
		await expect(copy.locator('.stderr')).toHaveText('');
		await copy.locator('canvas').press('Escape');
		await copy.evaluate(() => {
			const code = '<?php //{"autorun":true,"persist":false,"canvas":false,"extensionFlags":0}\n echo "fragment navigation";';
			window.location.hash = new URLSearchParams({code}).toString();
		});
		await expect(copy.locator('.stdout .scroller').last()).toHaveText('fragment navigation', {timeout: 180000});
		await copy.close();
	});

	test('cube supports input, audio, refresh, rerun and switching to sine', async ({page}) => {
		const failures = [];
		page.on('pageerror', error => failures.push(error.message));
		await page.goto(`embedded-php.html?demo=sdl-cube.php&version=${version}&no-service-worker`, {waitUntil: 'domcontentloaded'});
		const canvas = page.locator('canvas');
		const status = page.locator('[data-sdl-status]');
		await expect(status).toHaveText('Running · sound off', {timeout: 180000});
		await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(2);
		await canvas.press('Space');
		await expect(canvas).toHaveAttribute('data-paused', '1');
		await page.locator('[data-sdl-audio]').click();
		await expect(status).toContainText('sound on');
		await page.locator('[data-refresh]').click();
		await expect(canvas).toHaveAttribute('data-stopped', '1');
		await page.locator('[data-run]').click();
		await expect(canvas).toHaveAttribute('data-stopped', '0');
		await expect(status).toHaveText('Running · sound off');
		await page.locator('[data-run]').click();
		await expect(status).toHaveText('Running · sound off');
		const original = await canvas.elementHandle();
		await page.locator('[data-select-demo]').first().selectOption('sdl-sine.php');
		await page.locator('[data-load-demo]').click();
		await expect.poll(() => original.evaluate(node => node.isConnected)).toBe(false);
		await expect(page.locator('.Embedded')).toHaveAttribute('data-running', '0');
		await expect(page.locator('.stderr')).toHaveText('');
		await page.locator('[data-select-demo]').first().selectOption('sdl-cube.php');
		await page.locator('[data-load-demo]').click();
		await expect(status).toHaveText('Running · sound off', {timeout: 180000});
		await canvas.press('Escape');
		await expect(canvas).toHaveAttribute('data-stopped', '1');
		await expect(page.locator('.stderr')).toHaveText('');
		expect(failures).toEqual([]);
	});
});

test('Curvature demo serializes the bridged form value', async ({ page }) => {
	const runtimeFailures = [];

	page.on('pageerror', error => runtimeFailures.push(error.message));

	await page.goto(`embedded-php.html?demo=curvature.php&version=${version}&extensionFlags=0&no-service-worker`, {
		waitUntil: 'domcontentloaded'
	});

	await expect(page.locator('[data-status]')).toHaveText('php-wasm ready!', {
		timeout: 180000
	});
	await expect(page.locator('#example')).toContainText(
		'PHP Serialized: a:2:{s:2:"id";s:0:"";s:4:"name";s:0:"";}'
	);
	await expect.poll(async () => (
		(await page.locator('#example p').filter({hasText: 'JSON:'}).textContent())
			.replace(/\s/g, '')
	)).toBe('JSON:{"id":"","name":""}');
	await expect(page.locator('.stderr .scroller').last()).toBeEmpty();
	expect(runtimeFailures).toEqual([]);
});

test('cli preview runs a php script without Web Locks', async ({ page }) => {
	const code = encodeURIComponent('echo "Hello, World!";');

	await page.addInitScript(() => {
		const keyboardOffset = 100;
		const visualViewport = new EventTarget();

		Object.defineProperties(visualViewport, {
			height: {
				get: () => Math.max(
					1
					, document.documentElement.clientHeight - keyboardOffset
				)
			}
			, offsetTop: {get: () => keyboardOffset}
			, offsetLeft: {get: () => 0}
			, pageTop: {get: () => keyboardOffset}
			, pageLeft: {get: () => 0}
			, scale: {get: () => 1}
		});

		Object.defineProperty(window, 'visualViewport', {
			configurable: true
			, value: visualViewport
		});

		Object.defineProperty(navigator, 'locks', {
			configurable: true
			, value: undefined
		});
	});

	await page.goto(`cli-preview.html?code=${code}&no-service-worker`, {
		waitUntil: 'domcontentloaded'
	});

	await expect(page.getByText('php-cli-wasm preview')).toBeVisible({ timeout: 180000 });
	await expect(page.getByText('Hello, World!')).toBeVisible({ timeout: 180000 });

	const viewportProperties = await page.evaluate(() => {
		const root = document.documentElement;
		const preview = document.querySelector('.viewport-page');
		const previewBounds = preview.getBoundingClientRect();
		const margin = Number.parseFloat(getComputedStyle(preview).marginTop);

		return {
			height: root.style.getPropertyValue('--visual-viewport-height')
			, offsetTop: root.style.getPropertyValue('--visual-viewport-offset-top')
			, expectedHeight: `${root.clientHeight - 100}px`
			, previewHeight: previewBounds.height
			, previewTop: previewBounds.top
			, expectedPreviewHeight: root.clientHeight - 100 - (2 * margin)
			, expectedPreviewTop: 100 + margin
		};
	});

	expect(viewportProperties.height).toBe(viewportProperties.expectedHeight);
	expect(viewportProperties.offsetTop).toBe('100px');
	expect(viewportProperties.previewHeight).toBeCloseTo(
		viewportProperties.expectedPreviewHeight
	);
	expect(viewportProperties.previewTop).toBeCloseTo(
		viewportProperties.expectedPreviewTop
	);
});

test('interactive cli uses the active readline prompt', async ({ page }) => {
	await page.goto('cli-preview.html?no-service-worker', {
		waitUntil: 'domcontentloaded'
	});

	const input = page.locator('input[name="stdin"]');
	const prompt = page.locator('.console-input span');
	const stdinLines = page.locator('.console-output .line[data-type="stdin"]');
	const output = page.locator('.console-output');

	await expect(input).toBeEnabled({ timeout: 180000 });
	await expect(prompt).toHaveText('php> ');

	const outerScroll = await page.evaluate(() => {
		const scrollingElement = document.scrollingElement;
		const scrollRange = scrollingElement.scrollHeight - scrollingElement.clientHeight;

		window.scrollTo(0, scrollingElement.scrollHeight);

		return {scrollRange, scrollY: window.scrollY};
	});

	expect(outerScroll.scrollRange).toBeLessThanOrEqual(1);
	expect(outerScroll.scrollY).toBeLessThanOrEqual(1);

	await input.fill('var_dump(readline("Enter your command: "));');
	await input.press('Enter');

	await expect(prompt).toHaveText('Enter your command: ');
	await input.fill('asdadasd');
	await input.press('Enter');

	await expect(stdinLines.nth(1)).toHaveText('Enter your command: asdadasd');
	await expect(output).toContainText('string(8) "asdadasd"');
	await expect(prompt).toHaveText('php> ');

	const outputText = await output.textContent();
	expect(outputText?.match(/Enter your command:/g)).toHaveLength(2);
});

test('waitline demo accepts current prompts, Unicode, blank lines, and callbacks', async ({ page }) => {
	await page.goto('waitline-preview.html?no-service-worker', {
		waitUntil: 'domcontentloaded'
	});

	const input = page.locator('input[name="stdin"]');
	const prompt = page.locator('.console-input span');
	const output = page.locator('.console-output');

	await expect(input).toBeEnabled({ timeout: 180000 });
	await expect(output).toContainText('API: 13/13 functions');
	await expect(prompt).toHaveText('1/3 Unicode input (try Grüße 🌍): ');
	await input.fill('Grüße 🌍');
	await input.press('Enter');

	await expect(prompt).toHaveText('2/3 Blank input (press Enter): ');
	await input.fill('');
	await input.press('Enter');

	await expect(prompt).toHaveText('3/3 Callback input: ');
	await input.fill('callback line');
	await input.press('Enter');

	await expect(output).toContainText(
		'PASS: waitline input and readline compatibility are working.'
	);
	await expect(page.locator('[data-status]').last()).toHaveText('0');
});

test('debug preview boots php-dbg', async ({ page }) => {
	await page.goto('dbg-preview.html?path=/preload/test_www/hello-world.php&no-service-worker', {
		waitUntil: 'domcontentloaded'
	});

	await expect(page.getByText('php-dbg-wasm preview')).toBeVisible({ timeout: 180000 });
	await expect(page.getByText('php-dbg-wasm ready!')).toBeVisible({ timeout: 180000 });
	await expect(page.locator('.console-output')).toContainText('/preload/test_www/hello-world.php', {
		timeout: 180000
	});
	const input = page.locator('.console-input input');
	await input.fill('help ' + 'w'.repeat(512));
	await input.press('Enter');
	await expect(page.locator('.console-output')).toContainText('w'.repeat(512));
	for(const width of [1280, 375, 320])
	{
		await page.setViewportSize({width, height: 812});
		await expectDebuggerContained(page.locator('.dbg-preview .frame'));
	}
});

test('select framework service worker serves CGI', async ({ page }) => {
	await page.goto('select-framework.html', {waitUntil: 'domcontentloaded'});

	await expect(page.getByText('Select a Framework:')).toBeVisible({ timeout: 180000 });
	await expect(page.locator('.select-framework')).toHaveClass(/\bviewport-page\b/);

	const drupalCard = page.locator('.frameworks .column', {
		has: page.getByRole('img', {name: 'drupal 11'})
	});

	await drupalCard.getByRole('button', {name: 'Start'}).click();

	const databaseDialog = page.getByRole('dialog', {name: 'Choose a Drupal database'});
	const databaseForm = databaseDialog.locator('form');
	const postgresOption = databaseDialog.getByRole('radio', {name: /PostgreSQL/});

	await expect(databaseDialog.getByRole('radio', {name: 'SQLite'})).toBeChecked();
	await expect(databaseDialog.getByText('Slow')).toBeVisible();
	await expect(databaseDialog.locator('.drupal-database-warning img')).toHaveAttribute(
		'src'
		, /(?:alert-16(?:\.[^/]*)?\.png|data:image\/png;base64)/
	);
	await postgresOption.check();
	await expect(postgresOption).toBeChecked();
	await expect(databaseForm).toHaveAttribute('method', 'get');
	await expect(databaseForm).toHaveAttribute('rel', 'opener');
	await expect(databaseForm).toHaveAttribute('target', '_blank');
	expect(await databaseForm.evaluate(form => Object.fromEntries(new FormData(form)))).toEqual({
		framework: 'drupal-11'
		, database: 'pgsql'
	});
	await databaseDialog.getByRole('button', {name: 'Cancel'}).click();
	await expect(databaseDialog).not.toBeVisible();

	await expect.poll(
		async () => {
			try
			{
				return await page.evaluate(
					() => navigator.serviceWorker?.controller?.scriptURL ?? null
				);
			}
			catch(error)
			{
				// The app reloads once when a newly installed worker takes control.
				if(error.message.includes('Execution context was destroyed'))
				{
					return null;
				}

				throw error;
			}
		},
		{ timeout: 180000 }
	).toContain('/php-wasm/cgi-worker.js');

	await page.evaluate(() => {
		const openDatabase = indexedDB.open.bind(indexedDB);

		indexedDB.open = (name, ...args) => (
			name === '/persist' || name === '/config'
				? {}
				: openDatabase(name, ...args)
		);
	});
	await page.getByRole('button', {name: 'Clear'}).click();
	await page.getByRole('button', {name: 'Confirm'}).click();

	const clearingOverlay = page.locator('.overlay > .install-demo');

	await expect(clearingOverlay).toContainText('Clearing IDBFS...');

	const clearingGeometry = await clearingOverlay.evaluate(container => {
		const overlayBounds = container.parentElement.getBoundingClientRect();
		const dialogBounds = container.querySelector(':scope > .center').getBoundingClientRect();

		return {
			horizontalOffset: Math.abs(
				(dialogBounds.left + dialogBounds.right) / 2
				- (overlayBounds.left + overlayBounds.right) / 2
			)
			, verticalOffset: Math.abs(
				(dialogBounds.top + dialogBounds.bottom) / 2
				- (overlayBounds.top + overlayBounds.bottom) / 2
			)
		};
	});

	expect(clearingGeometry.horizontalOffset).toBeLessThanOrEqual(1);
	expect(clearingGeometry.verticalOffset).toBeLessThanOrEqual(1);

	const response = await page.goto('cgi-bin/test/hello-world.php', {
		waitUntil: 'domcontentloaded'
	});

	expect(response?.status()).toBe(200);
	await expect(page.locator('body')).toContainText('Hello, World!', { timeout: 180000 });
});

test('Drupal database modal opens the selected installer with an opener', async ({ page }) => {
	await page.goto('select-framework.html?no-service-worker', {
		waitUntil: 'domcontentloaded'
	});

	const drupalCard = page.locator('.frameworks .column', {
		has: page.getByRole('img', {name: 'drupal 11'})
	});

	await drupalCard.getByRole('button', {name: 'Start'}).click();

	const databaseDialog = page.getByRole('dialog', {name: 'Choose a Drupal database'});

	await databaseDialog.getByRole('radio', {name: /PostgreSQL/}).check();

	const popupPromise = page.waitForEvent('popup');

	await databaseDialog.getByRole('button', {name: 'Start'}).click();

	const popup = await popupPromise;
	const installerUrl = /install-demo\.html\?framework=drupal-11&database=pgsql/;

	// The popup event can arrive while its initial blank document is unloading.
	await popup.waitForURL(installerUrl, {waitUntil: 'domcontentloaded', timeout: 5000});
	await expect(popup).toHaveURL(installerUrl);
	expect(await popup.evaluate(() => window.opener === window.opener?.top)).toBe(true);
	await popup.close();
});

test('framework chooser popup acquires service-worker control from a cross-origin iframe', async ({ page }) => {
	const startupFailures = [];

	await page.goto('home.html?no-service-worker', {waitUntil: 'domcontentloaded'});

	const demoUrl = new URL(page.url());
	const wrapperUrl = new URL(demoUrl);

	wrapperUrl.hostname = 'localhost';
	await page.goto(wrapperUrl.toString(), {waitUntil: 'domcontentloaded'});

	const chooserUrl = new URL('select-framework.html?iframed=1&no-service-worker=1', demoUrl);

	await page.evaluate(src => {
		const iframe = document.createElement('iframe');

		iframe.src = src;
		iframe.title = 'Cross-origin framework chooser';
		document.body.replaceChildren(iframe);
	}, chooserUrl.toString());

	const chooser = page.frameLocator('iframe[title="Cross-origin framework chooser"]');

	await expect(chooser.getByRole('link', {name: 'Open Full Demo'})).toBeVisible();

	const popupPromise = page.waitForEvent('popup');

	await chooser.getByRole('link', {name: 'Open Full Demo'}).click();

	const popup = await popupPromise;

	popup.on('console', message => {
		if(message.type() === 'error' && message.text().includes('service worker startup failed'))
		{
			startupFailures.push(message.text());
		}
	});

	await expect.poll(
		async () => popup.evaluate(
			() => navigator.serviceWorker?.controller?.scriptURL ?? null
		)
		, {timeout: 180000}
	).toContain('/php-wasm/cgi-worker.js');

	await expect(popup).not.toHaveURL(/no-service-worker/);
	await expect.poll(async () => popup.evaluate(() => ({
		topLevel: window.top === window
		, hasOpener: Boolean(window.opener)
		, openerTopLevel: window.opener
			? window.opener.top === window.opener
			: null
	}))).toEqual({
		topLevel: true
		, hasOpener: true
		, openerTopLevel: false
	});
	expect(startupFailures).toEqual([]);
});

test('CodeIgniter 4 installs through ZipArchive and runs through CGI', async ({ page }) => {
	test.setTimeout(600000);

	const runtimeFailures = [];

	page.on('pageerror', error => runtimeFailures.push(error.message));

	await page.goto('install-demo.html?framework=codeigniter-4', {
		waitUntil: 'domcontentloaded'
	});

	await expect(page).toHaveURL(/\/php-wasm\/cgi-bin\/codeigniter-4\/?$/, {
		timeout: 540000
	});
	await expect(page.locator('body')).toContainText('Welcome to CodeIgniter', {
		timeout: 180000
	});
	expect(runtimeFailures).toEqual([]);
});

test('Drupal 11.4.5 installs and runs through the existing CGI service-worker route', async ({ page }) => {
	test.setTimeout(600000);

	await page.goto('install-demo.html?framework=drupal-11', {
		waitUntil: 'domcontentloaded'
	});

	await expect(page).toHaveURL(/\/php-wasm\/cgi-bin\/drupal\/?$/, {
		timeout: 540000
	});
	await expect(page.locator('body')).toContainText('Drupal 11 on PHP-WASM', {
		timeout: 180000
	});
	await expect(page.locator('body')).toContainText('Welcome!', {
		timeout: 180000
	});

	const welcomeMessage = page.locator('.php-wasm-demo-login');

	await expect(welcomeMessage).toContainText('Drupal 11 is running in the browser!');
	await expect(welcomeMessage).toContainText('Username: admin');
	await expect(welcomeMessage).toContainText('Password: admin');

	const loginLink = welcomeMessage.getByRole('link', { name: 'Log in' });
	const editLink = welcomeMessage.getByRole('link', {
		name: 'Click here to edit this template!'
	});
	const editUrl = new URL(await editLink.getAttribute('href'), page.url());

	expect(new URL(await loginLink.getAttribute('href'), page.url()).pathname).toBe(
		'/php-wasm/cgi-bin/drupal/user/login'
	);
	expect(editUrl.pathname).toBe('/php-wasm/code-editor.html');
	expect(editUrl.searchParams.get('path')).toBe(
		'/persist/drupal-11.4.5/web/core/themes/olivero/templates/includes/get-started.html.twig'
	);
	expect(await editLink.getAttribute('target')).toBe('_blank');

	const stylesheet = page.locator('link[rel="stylesheet"][href]').first();
	const image = page.locator('img[src], link[rel~="icon"][href]').first();
	const stylesheetHref = await stylesheet.getAttribute('href');
	const imageSrc = await image.evaluate(element => element.getAttribute(
		element.tagName === 'IMG' ? 'src' : 'href'
	));
	const drupalAssetPrefix = '/php-wasm/cgi-bin/drupal/';

	expect(new URL(stylesheetHref, page.url()).pathname).toMatch(
		new RegExp(`^${drupalAssetPrefix}`)
	);
	expect(new URL(imageSrc, page.url()).pathname).toMatch(
		new RegExp(`^${drupalAssetPrefix}`)
	);

	const assets = await page.evaluate(async ({ stylesheetHref, imageSrc }) => {
		const load = async url => {
			const response = await fetch(url);
			const body = await response.arrayBuffer();

			return {
				status: response.status
				, contentType: response.headers.get('content-type') ?? ''
				, size: body.byteLength
			};
		};

		return {
			stylesheet: await load(stylesheetHref)
			, image: await load(imageSrc)
		};
	}, { stylesheetHref, imageSrc });

	expect(assets.stylesheet.status).toBe(200);
	expect(assets.stylesheet.contentType).toMatch(/^text\/css\b/);
	expect(assets.stylesheet.size).toBeGreaterThan(100);
	expect(assets.image.status).toBe(200);
	expect(assets.image.contentType).toMatch(/^image\//);
	expect(assets.image.size).toBeGreaterThan(100);

	const rootRelativeLinks = page.locator([
		'a[href^="/"]'
		, ':not([href^="//"])'
		, `:not([href^="${drupalAssetPrefix}"])`
		, ':not([href^="/php-wasm/code-editor.html"])'
	].join(''));

	await expect(rootRelativeLinks).toHaveCount(0);

	await loginLink.click();
	await expect(page).toHaveURL(`${drupalAssetPrefix}user/login`);
	await page.locator('input[name="name"]').fill('admin');
	await page.locator('input[name="pass"]').fill('admin');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).not.toHaveURL(/\/user\/login(?:\?|$)/, { timeout: 180000 });
	await expect(page.locator('body')).toContainText('admin', { timeout: 180000 });
});

test('Drupal 11.4.5 installs and runs with PostgreSQL in PGlite', async ({ page }) => {
	test.setTimeout(600000);

	const runtimeFailures = [];

	page.on('pageerror', error => runtimeFailures.push(error.message));

	await page.goto('install-demo.html?framework=drupal-11&database=pgsql', {
		waitUntil: 'domcontentloaded'
	});

	await expect(page).toHaveURL(/\/php-wasm\/cgi-bin\/drupal\/?$/, {
		timeout: 540000
	});
	await expect(page.locator('body')).toContainText('Drupal 11 on PHP-WASM', {
		timeout: 180000
	});

	const welcomeMessage = page.locator('.php-wasm-demo-login');
	const loginLink = welcomeMessage.getByRole('link', { name: 'Log in' });
	const editLink = welcomeMessage.getByRole('link', {
		name: 'Click here to edit this template!'
	});
	const editUrl = new URL(await editLink.getAttribute('href'), page.url());
	const drupalPrefix = '/php-wasm/cgi-bin/drupal/';

	await expect(welcomeMessage).toContainText('Drupal 11 is running in the browser!');
	expect(editUrl.searchParams.get('path')).toBe(
		'/persist/drupal-11.4.5-pgsql/web/core/themes/olivero/templates/includes/get-started.html.twig'
	);

	await loginLink.click();
	await expect(page).toHaveURL(`${drupalPrefix}user/login`);
	await page.locator('input[name="name"]').fill('admin');
	await page.locator('input[name="pass"]').fill('admin');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).not.toHaveURL(/\/user\/login(?:\?|$)/, { timeout: 180000 });

	await page.goto(`${drupalPrefix}admin/reports/status`, {
		waitUntil: 'domcontentloaded'
	});
	await expect(page.locator('body')).toContainText('PostgreSQL', {
		timeout: 180000
	});
	expect(runtimeFailures).toEqual([]);
});

test('WordPress 7.1 installs, serves its assets, and logs in with SQLite', async ({ page }) => {
	test.setTimeout(600000);

	const runtimeFailures = [];

	page.on('console', message => {
		if(
			message.text().includes('Aborted(invalid state')
			|| message.text().includes("WebSocket connection to 'ws://api.wordpress.org")
		) {
			runtimeFailures.push(message.text());
		}
	});

	await page.goto('install-demo.html?framework=wordpress-7.1', {
		waitUntil: 'domcontentloaded'
	});

	await expect(page).toHaveURL(/\/php-wasm\/cgi-bin\/wordpress\/?$/, {
		timeout: 540000
	});
	await expect(page.locator('body')).toContainText('WordPress 7.1 on PHP-WASM', {
		timeout: 180000
	});

	const welcomeMessage = page.locator('.php-wasm-demo-login');

	await expect(welcomeMessage).toContainText('WordPress 7.1 is running in the browser!');
	await expect(welcomeMessage).toContainText('Username: admin');
	await expect(welcomeMessage).toContainText('Password: admin');

	const wordpressPrefix = '/php-wasm/cgi-bin/wordpress/';
	const loginLink = welcomeMessage.getByRole('link', { name: 'Log in' });
	const editLink = welcomeMessage.getByRole('link', {
		name: 'Click here to edit this welcome message!'
	});
	const editUrl = new URL(await editLink.getAttribute('href'), page.url());

	expect(new URL(await loginLink.getAttribute('href'), page.url()).pathname).toBe(
		`${wordpressPrefix}wp-login.php`
	);
	expect(editUrl.pathname).toBe('/php-wasm/code-editor.html');
	expect(editUrl.searchParams.get('path')).toBe(
		'/persist/wordpress-7.1/wp-content/mu-plugins/php-wasm-demo.php'
	);
	expect(await editLink.getAttribute('target')).toBe('_blank');

	const assetUrls = {
		stylesheet: `${wordpressPrefix}wp-includes/css/dashicons.min.css`
		, image: `${wordpressPrefix}wp-admin/images/wordpress-logo.svg`
		, font: `${wordpressPrefix}wp-includes/fonts/dashicons.ttf`
	};

	expect(new URL(assetUrls.stylesheet, page.url()).pathname).toMatch(
		new RegExp(`^${wordpressPrefix}`)
	);

	const assets = await page.evaluate(async urls => {
		const load = async url => {
			const response = await fetch(url);
			const body = await response.arrayBuffer();

			return {
				status: response.status
				, contentType: response.headers.get('content-type') ?? ''
				, size: body.byteLength
			};
		};

		return {
			stylesheet: await load(urls.stylesheet)
			, image: await load(urls.image)
			, font: await load(urls.font)
		};
	}, assetUrls);

	expect(assets.stylesheet.status).toBe(200);
	expect(assets.stylesheet.contentType).toMatch(/^text\/css\b/);
	expect(assets.stylesheet.size).toBeGreaterThan(100);
	expect(assets.image.status).toBe(200);
	expect(assets.image.contentType).toMatch(/^image\/svg\+xml\b/);
	expect(assets.image.size).toBeGreaterThan(100);
	expect(assets.font.status).toBe(200);
	expect(assets.font.contentType).toMatch(/^font\/ttf\b/);
	expect(assets.font.size).toBeGreaterThan(100);

	const invalidInternalLinks = await page.locator('a[href]').evaluateAll((links, prefix) => (
		links.map(link => link.href).filter(href => {
			const url = new URL(href);
			const root = prefix.slice(0, -1);

			return url.origin === window.location.origin
				&& url.pathname !== root
				&& url.pathname !== '/php-wasm/code-editor.html'
				&& !url.pathname.startsWith(prefix);
		})
	), wordpressPrefix);

	expect(invalidInternalLinks).toEqual([]);
	expect(await page.content()).not.toContain('127.0.0.1:38977');

	await loginLink.click();
	await expect(page).toHaveURL(new RegExp(`${wordpressPrefix}wp-login\\.php`));
	await page.locator('input[name="log"]').fill('admin');
	await page.locator('input[name="pwd"]').fill('admin');
	await page.getByRole('button', { name: 'Log In' }).click();
	await expect(page).toHaveURL(new RegExp(`${wordpressPrefix}wp-admin/`), {
		timeout: 180000
	});
	await expect(page.locator('body')).toContainText('Dashboard', { timeout: 180000 });

	await page.reload({waitUntil: 'domcontentloaded'});
	await expect(page.locator('body')).toContainText('Dashboard', { timeout: 180000 });

	const aboutResponse = await page.goto('cgi-bin/wordpress/wp-admin/about.php', {
		waitUntil: 'domcontentloaded'
	});

	expect(aboutResponse?.status()).toBe(200);
	await expect(page.locator('body')).toContainText('WordPress 7.1', { timeout: 180000 });
	expect(runtimeFailures).toEqual([]);
});
