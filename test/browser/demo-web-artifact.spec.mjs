import { test, expect } from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';

test.describe.configure({ mode: 'serial' });

test('home page uses the production base path', async ({ page }) => {
	await page.goto('home.html?no-service-worker', {waitUntil: 'domcontentloaded'});

	await expect(page).toHaveURL(/\/php-wasm\/home\.html\?no-service-worker$/);
	await expect(page.getByRole('heading', { name: 'Select a demo:' })).toBeVisible();

	const embeddedLink = page.getByRole('link', { name: /PHP Embedded Demo/ });
	const frameworkLink = page.getByRole('link', { name: /PHP CGI Demo/ });

	await expect(embeddedLink).toHaveAttribute(
		'href',
		'/php-wasm/embedded-php.html?demo=sdl-sine.php'
	);
	await expect(frameworkLink).toHaveAttribute('href', '/php-wasm/select-framework.html');
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

	const outputFrame = page.locator('iframe').nth(1);

	await expect.poll(
		async () => (await outputFrame.getAttribute('srcdoc')) ?? '',
		{ timeout: 180000 }
	).toContain('Hello, World!');
});

test('cli preview runs a php script without Web Locks', async ({ page }) => {
	const code = encodeURIComponent('echo "Hello, World!";');

	await page.addInitScript(() => {
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
	await input.fill('var_dump(readline("Enter your command: "));');
	await input.press('Enter');

	await expect(prompt).toHaveText('Enter your command: ');
	await input.fill('asdadasd');
	await input.press('Enter');

	await expect(stdinLines.nth(1)).toHaveText('Enter your command: asdadasd');
	await expect(output).toContainText('string(8) "asdadasd"');
	await expect(prompt).toHaveText('php> ');
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
});

test('select framework service worker serves CGI', async ({ page }) => {
	await page.goto('select-framework.html', {waitUntil: 'domcontentloaded'});

	await expect(page.getByText('Select a Framework:')).toBeVisible({ timeout: 180000 });

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

	const response = await page.goto('cgi-bin/test/hello-world.php', {
		waitUntil: 'domcontentloaded'
	});

	expect(response?.status()).toBe(200);
	await expect(page.locator('body')).toContainText('Hello, World!', { timeout: 180000 });
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
