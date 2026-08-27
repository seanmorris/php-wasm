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

test('cli preview runs a php script', async ({ page }) => {
	const code = encodeURIComponent('echo "Hello, World!";');

	await page.goto(`cli-preview.html?code=${code}&no-service-worker`, {
		waitUntil: 'domcontentloaded'
	});

	await expect(page.getByText('php-cli-wasm preview')).toBeVisible({ timeout: 180000 });
	await expect(page.getByText('Hello, World!')).toBeVisible({ timeout: 180000 });
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
	].join(''));

	await expect(rootRelativeLinks).toHaveCount(0);

	await page.goto(`${drupalAssetPrefix}user/login`, {
		waitUntil: 'domcontentloaded'
	});
	await page.locator('input[name="name"]').fill('admin');
	await page.locator('input[name="pass"]').fill('admin');
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page).not.toHaveURL(/\/user\/login(?:\?|$)/, { timeout: 180000 });
	await expect(page.locator('body')).toContainText('admin', { timeout: 180000 });
});
