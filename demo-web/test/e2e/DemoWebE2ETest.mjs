import { BotTest } from 'cv3-test/BotTest.mjs';

const version = process.env.PHP_VERSION ?? '8.4';
const port = Number(process.env.DEMO_WEB_E2E_PORT ?? 9414);
const baseUrl = `http://127.0.0.1:${port}/php-wasm/`;

const Delay = timeout => new Promise(accept => setTimeout(accept, timeout));

export class DemoWebE2ETest extends BotTest
{
	startDocument = 'about:blank';
	parallel = false;
	width = 1440;
	height = 960;

	base(path = '')
	{
		return new URL(path, baseUrl).toString();
	}

	async setUp()
	{
		await super.setUp();
		await this.resetBrowserState();
	}

	async breakDown()
	{
		try
		{
			await this.resetBrowserState();
		}
		finally
		{
			await super.breakDown();
		}
	}

	async resetBrowserState()
	{
		await this.pobot.goto(this.base('home.html?no-service-worker&e2e-reset=1'));
		await this.pobot.inject(async () => {
			const registrations = 'serviceWorker' in navigator
				? await navigator.serviceWorker.getRegistrations()
				: [];

			await Promise.all(registrations.map(registration => registration.unregister()));

			if('caches' in globalThis)
			{
				const keys = await caches.keys();
				await Promise.all(keys.map(key => caches.delete(key)));
			}

			for(const dbName of ['/persist', '/config', 'EM_PRELOAD_CACHE'])
			{
				await new Promise(resolve => {
					const request = indexedDB.deleteDatabase(dbName);
					request.onsuccess = request.onerror = request.onblocked = () => resolve();
				});
			}

			localStorage.clear();
			sessionStorage.clear();
		});
	}

	async waitFor(description, probe, {timeout = 90000, interval = 250} = {})
	{
		const start = Date.now();

		while(Date.now() - start < timeout)
		{
			const result = await this.pobot.inject(probe);

			if(result)
			{
				return result;
			}

			await Delay(interval);
		}

		this.assert(false, `Timed out waiting for ${description}`);
		throw new Error(`Timed out waiting for ${description}`);
	}

	async testHomePageUsesProductionBasePath()
	{
		await this.pobot.goto(this.base('home.html?no-service-worker'));

		const details = await this.waitFor(
			'home screen content',
			() => {
				const heading = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('Select a demo:'));
				const embeddedLink = [...document.querySelectorAll('a')].find(a => a.textContent.includes('PHP Embedded Demo'));
				const frameworkLink = [...document.querySelectorAll('a')].find(a => a.textContent.includes('PHP CGI Demo'));

				if(!heading || !embeddedLink || !frameworkLink)
				{
					return null;
				}

				return {
					pathname: window.location.pathname
					, heading: heading.textContent.trim()
					, embeddedHref: embeddedLink.getAttribute('href')
					, frameworkHref: frameworkLink.getAttribute('href')
				};
			}
		);

		this.assert(details.pathname === '/php-wasm/home.html', 'Home page is served from /php-wasm/home.html');
		this.assert(details.heading === 'Select a demo:', 'Home page heading renders');
		this.assert(details.embeddedHref === '/php-wasm/embedded-php.html?demo=sdl-sine.php', 'Embedded demo link keeps /php-wasm base path');
		this.assert(details.frameworkHref === '/php-wasm/select-framework.html', 'Framework link keeps /php-wasm base path');
	}

	async testHomeDemoQueryRedirectsToEmbeddedPage()
	{
		await this.pobot.goto(this.base('home.html?demo=hello-world.php&version=8.4&no-service-worker'));

		const redirected = await this.waitFor(
			'home demo redirect into embedded php',
			() => {
				if(!window.location.pathname.endsWith('/embedded-php.html'))
				{
					return null;
				}

				const outputFrame = document.querySelectorAll('iframe')[1];
				const srcdoc = outputFrame?.getAttribute('srcdoc') ?? '';

				if(!srcdoc.includes('Hello, World!'))
				{
					return null;
				}

				return {
					pathname: window.location.pathname
					, search: window.location.search
					, srcdoc
				};
			},
			{timeout: 180000}
		);

		this.assert(redirected.pathname === '/php-wasm/embedded-php.html', 'Home demo query redirects into embedded-php.html under /php-wasm');
		this.assert(redirected.search.includes('version=8.4'), 'Home redirect preserves the selected version');
		this.assert(redirected.srcdoc.includes('Hello, World!'), 'Home redirect executes the selected embedded demo');
	}

	async testEmbeddedPhpHelloWorldRuns()
	{
		await this.pobot.goto(this.base(`embedded-php.html?demo=hello-world.php&version=${version}&extensionFlags=0&no-service-worker`));

		const output = await this.waitFor(
			'embedded hello world output',
			() => {
				const frames = [...document.querySelectorAll('iframe')];
				const outputFrame = frames[1];
				const srcdoc = outputFrame?.getAttribute('srcdoc') ?? '';
				return srcdoc.includes('Hello, World!') ? srcdoc : null;
			},
			{timeout: 180000}
		);

		this.assert(output.includes('Hello, World!'), 'Embedded PHP hello-world demo renders expected output');
	}

	async testCliPreviewRunsPhpScript()
	{
		const code = encodeURIComponent('echo "Hello, World!";');
		await this.pobot.goto(this.base(`cli-preview.html?code=${code}&no-service-worker`));

		const cli = await this.waitFor(
			'cli preview output',
			() => {
				const bodyText = document.body.innerText;
				return bodyText.includes('Hello, World!')
					? bodyText
					: null;
			},
			{timeout: 180000}
		);

		this.assert(cli.includes('php-cli-wasm preview'), 'CLI preview shell renders');
		this.assert(cli.includes('Hello, World!'), 'CLI preview executes hello-world script');
	}

	async testDbgPreviewBootsPhpDbg()
	{
		await this.pobot.goto(this.base('dbg-preview.html?path=/preload/test_www/hello-world.php&no-service-worker'));

		const dbg = await this.waitFor(
			'php-dbg preview ready state',
			() => {
				const bodyText = document.body.innerText;
				return bodyText.includes('php-dbg-wasm ready!')
					? bodyText
					: null;
			},
			{timeout: 180000}
		);

		this.assert(dbg.includes('php-dbg-wasm preview'), 'Debugger preview shell renders');
		this.assert(dbg.includes('/preload/test_www/hello-world.php'), 'Debugger preview loads requested script path');
	}

	async testSelectFrameworkRegistersServiceWorker()
	{
		await this.pobot.goto(this.base('select-framework.html'));

		const serviceWorker = await this.waitFor(
			'service worker controller on select-framework',
			async () => {
				if(!navigator.serviceWorker?.controller)
				{
					return null;
				}

				const registration = await navigator.serviceWorker.getRegistration('/php-wasm/');

				if(!registration)
				{
					return null;
				}

				return {
					controller: navigator.serviceWorker.controller.scriptURL
					, registration: registration.active?.scriptURL ?? registration.installing?.scriptURL ?? registration.waiting?.scriptURL ?? ''
					, bodyText: document.body.innerText
				};
			},
			{timeout: 180000}
		);

		this.assert(serviceWorker.bodyText.includes('Select a Framework:'), 'Select framework page renders after service worker bootstrap');
		this.assert(serviceWorker.registration.endsWith('/php-wasm/cgi-worker.js'), 'Service worker registers the php-wasm worker script');
	}
}
