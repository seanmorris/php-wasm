import { test, expect } from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9414);
const baseUrl = `http://127.0.0.1:${port}/php-wasm/`;

test.describe.configure({ mode: 'serial' });

const base = (pathname = '') => new URL(pathname, baseUrl).toString();

test('home page uses the production base path', async ({ page }) => {
	await page.goto(base('home.html?no-service-worker'));

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
	await page.goto(base('home.html?demo=hello-world.php&version=8.4&no-service-worker'));

	await expect(page).toHaveURL(/\/php-wasm\/embedded-php\.html/, { timeout: 180000 });
	await expect(page).toHaveURL(/version=8\.4/, { timeout: 180000 });

	const outputFrame = page.locator('iframe').nth(1);

	await expect.poll(
		async () => (await outputFrame.getAttribute('srcdoc')) ?? '',
		{ timeout: 180000 }
	).toContain('Hello, World!');
});

test('embedded php hello world runs', async ({ page }) => {
	await page.goto(base(`embedded-php.html?demo=hello-world.php&version=${version}&extensionFlags=0&no-service-worker`));

	const outputFrame = page.locator('iframe').nth(1);

	await expect.poll(
		async () => (await outputFrame.getAttribute('srcdoc')) ?? '',
		{ timeout: 180000 }
	).toContain('Hello, World!');
});

test('cli preview runs a php script', async ({ page }) => {
	const code = encodeURIComponent('echo "Hello, World!";');

	await page.goto(base(`cli-preview.html?code=${code}&no-service-worker`));

	await expect(page.getByText('php-cli-wasm preview')).toBeVisible({ timeout: 180000 });
	await expect(page.getByText('Hello, World!')).toBeVisible({ timeout: 180000 });
});

test('debug preview boots php-dbg', async ({ page }) => {
	await page.goto(base('dbg-preview.html?path=/preload/test_www/hello-world.php&no-service-worker'));

	await expect(page.getByText('php-dbg-wasm preview')).toBeVisible({ timeout: 180000 });
	await expect(page.getByText('php-dbg-wasm ready!')).toBeVisible({ timeout: 180000 });
	await expect(page.locator('.console-output')).toContainText('/preload/test_www/hello-world.php', { timeout: 180000 });
});

test('select framework registers the service worker', async ({ page }) => {
	await page.goto(base('select-framework.html'));

	await expect(page.getByText('Select a Framework:')).toBeVisible({ timeout: 180000 });

	await expect.poll(
		() => page.evaluate(async () => {
			if(!navigator.serviceWorker?.controller)
			{
				return null;
			}

			const registration = await navigator.serviceWorker.getRegistration('/php-wasm/');

			return registration
				? (
					registration.active?.scriptURL
					?? registration.installing?.scriptURL
					?? registration.waiting?.scriptURL
					?? ''
				)
				: null;
		}),
		{ timeout: 180000 }
	).toContain('/php-wasm/cgi-worker.js');
});
