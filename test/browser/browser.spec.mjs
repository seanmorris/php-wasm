import { test, expect } from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const buildType = process.env.BUILD_TYPE ?? 'dynamic';
const variant = process.env.PHP_VARIANT ?? '';

const demoCases = [
	{
		name: 'renders the hello world embedded demo',
		demo: 'hello-world.php',
		extensionFlags: 0,
		snapshot: 'BrowserTest.testHelloWorld_0.json',
	},
	{
		name: 'renders the sqlite embedded demo',
		demo: 'sqlite.php',
		extensionFlags: 1024,
		snapshot: 'BrowserTest.testSqlite_0.json',
	},
	{
		name: 'renders the postgres embedded demo',
		demo: 'postgres.php',
		extensionFlags: 0,
		snapshot: 'BrowserTest.testPostgres_0.json',
		minVersion: '8.2',
	},
	{
		name: 'renders the sqlite pdo embedded demo',
		demo: 'sqlite-pdo.php',
		extensionFlags: 1024,
		snapshot: 'BrowserTest.testSqlitePdo_0.json',
	},
	{
		name: 'renders the files embedded demo',
		demo: 'files.php',
		extensionFlags: 0,
		snapshot: 'BrowserTest.testFiles_0.json',
	},
	{
		name: 'renders the goto embedded demo',
		demo: 'goto.php',
		extensionFlags: 0,
		snapshot: 'BrowserTest.testGoto_0.json',
	},
	{
		name: 'renders the dynamic extensions embedded demo',
		demo: 'dynamic-extension.php',
		extensionFlags: 0,
		snapshot: 'BrowserTest.testDynamicExtensions_0.json',
	},
];

test.describe.configure({ mode: 'serial' });

const comparePhpVersions = (left, right) => {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);

	for(let i = 0; i < Math.max(leftParts.length, rightParts.length); i++)
	{
		const leftPart = leftParts[i] ?? 0;
		const rightPart = rightParts[i] ?? 0;

		if(leftPart === rightPart)
		{
			continue;
		}

		return leftPart - rightPart;
	}

	return 0;
};

const demoUrl = ({demo, extensionFlags}) => {
	const params = new URLSearchParams({
		buildType,
		demo,
		extensionFlags: String(extensionFlags),
		version,
	});

	if(variant)
	{
		params.set('variant', variant);
	}

	return `harness/embedded.html?${params.toString()}`;
};

const waitForHarnessStatus = async (page, expectedStatus = 'done') => {
	await expect(async () => {
		const status = await page.locator('[data-testid="status"]').textContent();

		if(status === 'failed')
		{
			const stderr = await page.locator('[data-testid="stderr"]').textContent();
			throw new Error(stderr || 'Harness reported failure.');
		}

		expect(status).toBe(expectedStatus);
	}).toPass({
		timeout: 180000,
		intervals: [250, 500, 1000, 2000, 4000]
	});
};

const expectEmbeddedDemoSnapshot = async (page, fixture) => {
	await page.goto(demoUrl(fixture), {waitUntil: 'domcontentloaded'});
	await waitForHarnessStatus(page);

	const stdout = await page.locator('[data-testid="stdout"]').textContent();
	expect(JSON.stringify(stdout ?? '')).toMatchSnapshot(fixture.snapshot);
};

for(const fixture of demoCases)
{
	test(fixture.name, async ({ page }) => {
		if(fixture.minVersion && comparePhpVersions(version, fixture.minVersion) < 0)
		{
			test.skip(`${fixture.demo} only runs on PHP ${fixture.minVersion}+.`);
		}

		await expectEmbeddedDemoSnapshot(page, fixture);
	});
}

test('runs a cli script in the browser harness', async ({ page }) => {
	const params = new URLSearchParams({
		buildType,
		code: 'echo "Hello, World!";',
		version,
	});

	await page.goto(`harness/cli.html?${params.toString()}`, {waitUntil: 'domcontentloaded'});
	await waitForHarnessStatus(page);
	await expect(page.locator('[data-testid="stdout"]')).toContainText('Hello, World!');
});

test('boots phpdbg in the browser harness', async ({ page }) => {
	const params = new URLSearchParams({
		buildType,
		path: '/preload/test_www/hello-world.php',
		version,
	});

	await page.goto(`harness/dbg.html?${params.toString()}`, {waitUntil: 'domcontentloaded'});
	await waitForHarnessStatus(page, 'ready');

	await expect(async () => {
		const currentFile = await page.locator('[data-testid="current-file"]').textContent();
		const stdout = await page.locator('[data-testid="stdout"]').textContent();

		expect(
			currentFile === '/preload/test_www/hello-world.php'
			|| (stdout ?? '').includes('/preload/test_www/hello-world.php')
		).toBe(true);
	}).toPass({
		timeout: 30000,
		intervals: [250, 500, 1000, 2000]
	});
});

test('serves php through the cgi worker harness', async ({ page }) => {
	const params = new URLSearchParams({
		buildType,
		version,
	});

	await page.goto(`harness/cgi.html?${params.toString()}`, {waitUntil: 'domcontentloaded'});
	await waitForHarnessStatus(page);
	await expect(page.locator('[data-testid="controller"]')).toContainText('/php-wasm/cgi-worker.mjs');
	await expect(page.locator('[data-testid="request-path"]')).toHaveText('/php-wasm/cgi-bin/test');
	await expect(page.locator('[data-testid="status-code"]')).toHaveText('200');
	await expect(page.locator('[data-testid="powered-by"]')).toContainText(`PHP/${version}`);
	await expect(page.locator('[data-testid="stderr"]')).toHaveText('');
});
