import { test, expect } from '@playwright/test';

const version = process.env.PHP_VERSION ?? '8.4';
const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9000);
const baseUrl = `http://127.0.0.1:${port}/php-wasm/`;

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
		versions: ['8.4', '8.3', '8.2'],
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
		extensionFlags: 8,
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

const demoUrl = ({demo, extensionFlags}) => {
	return `${baseUrl}embedded-php.html?demo=${demo}&version=${version}&extensionFlags=${extensionFlags}&no-service-worker`;
};

const expectEmbeddedDemoSnapshot = async (page, fixture) => {
	await page.goto(demoUrl(fixture), {waitUntil: 'domcontentloaded'});

	const phpOutput = page.locator('iframe').nth(1);

	await expect(async () => {
		const srcdoc = await phpOutput.getAttribute('srcdoc');
		expect(srcdoc).toBeTruthy();
		expect(JSON.stringify(srcdoc, null, 4)).toMatchSnapshot(fixture.snapshot);
	}).toPass({
		timeout: 180000,
		intervals: [250, 500, 1000, 2000, 4000]
	});
};

for(const fixture of demoCases)
{
	test(fixture.name, async ({ page }) => {
		if(fixture.versions && !fixture.versions.includes(version))
		{
			test.skip(`${fixture.demo} only runs on PHP ${fixture.versions.join(', ')}.`);
		}

		await expectEmbeddedDemoSnapshot(page, fixture);
	});
}
