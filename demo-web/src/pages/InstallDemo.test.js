import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const { ensureServiceWorker, getPhpBus } = vi.hoisted(() => ({
	ensureServiceWorker: vi.fn()
	, getPhpBus: vi.fn()
}));

vi.mock('../lib/serviceWorker', () => ({
	ensureServiceWorker
	, serviceWorkerControlTimeoutMs: 1500
}));

vi.mock('../lib/phpBus', async importOriginal => ({
	...(await importOriginal())
	, getPhpBus
}));

vi.mock('../components/Terminal', () => ({
	default: function TerminalMock() {
		return null;
	}
}));

import InstallDemo from './InstallDemo';

describe('InstallDemo', () => {
	let fetchMock;
	let bus;
	let originalServiceWorker;
	let originalLocks;

	beforeEach(() => {
		ensureServiceWorker.mockReset();
		getPhpBus.mockReset();

		bus = {
			analyzePath: vi.fn(async () => ({exists: false}))
			, getSettings: vi.fn(async () => ({vHosts: []}))
			, writeFile: vi.fn(async () => undefined)
			, setSettings: vi.fn(async () => undefined)
			, storeInit: vi.fn(async () => undefined)
			, refresh: vi.fn(async () => undefined)
			, execSql: vi.fn(async () => undefined)
			, runSql: vi.fn(async () => undefined)
		};

		getPhpBus.mockResolvedValue(bus);

		ensureServiceWorker.mockResolvedValue({
			supported: true
			, registered: true
			, controlled: true
			, controller: {scriptURL: '/php-wasm/cgi-worker.js'}
			, controlSource: 'existing'
		});

		fetchMock = vi.fn(async (url) => {
			if(String(url).includes('scripts/init.php'))
			{
				return {
					text: async () => '<?php echo "init";'
				};
			}

			if(String(url).includes('/backups/drupal-7.95.zip'))
			{
				return {
					arrayBuffer: async () => new ArrayBuffer(8)
				};
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		vi.stubGlobal('fetch', fetchMock);

		originalServiceWorker = navigator.serviceWorker;
		originalLocks = navigator.locks;

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: {
				controller: {scriptURL: '/php-wasm/cgi-worker.js'}
			}
		});

		Object.defineProperty(navigator, 'locks', {
			configurable: true
			, value: {
				request: vi.fn(async (_, callback) => callback())
			}
		});

		sessionStorage.clear();
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-7');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		sessionStorage.clear();

		if(originalServiceWorker === undefined)
		{
			delete navigator.serviceWorker;
		}
		else
		{
			Object.defineProperty(navigator, 'serviceWorker', {
				configurable: true
				, value: originalServiceWorker
			});
		}

		if(originalLocks === undefined)
		{
			delete navigator.locks;
		}
		else
		{
			Object.defineProperty(navigator, 'locks', {
				configurable: true
				, value: originalLocks
			});
		}
	});

	it('boots the installer only once under StrictMode', async () => {
		render(
			React.createElement(
				React.StrictMode
				, null
				, React.createElement(InstallDemo)
			)
		);

		await waitFor(() => expect(bus.storeInit).toHaveBeenCalledTimes(1));

		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('scripts/init.php'))).toHaveLength(1);
		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/backups/drupal-7.95.zip'))).toHaveLength(1);
		expect(navigator.locks.request).toHaveBeenCalledTimes(1);
	});

	it('sanitizes runtime settings before sending them back to the worker', async () => {
		bus.getSettings.mockResolvedValue({
			docroot: '/persist/www'
			, maxRequestAge: 1234
			, staticCacheTime: 10
			, dynamicCacheTime: 20
			, vHosts: [
				{
					pathPrefix: '/php-wasm/cgi-bin/test'
					, directory: '/preload/test_www'
					, entrypoint: 'hello-world.php'
					, locateFile: () => '/tmp/not-cloneable'
				}
			]
		});

		render(<InstallDemo />);

		await waitFor(() => expect(bus.setSettings).toHaveBeenCalledTimes(1));

		expect(bus.setSettings).toHaveBeenCalledWith({
			docroot: '/persist/www'
			, maxRequestAge: 1234
			, staticCacheTime: 10
			, dynamicCacheTime: 20
			, vHosts: [
				{
					pathPrefix: '/php-wasm/cgi-bin/test'
					, directory: '/preload/test_www'
					, entrypoint: 'hello-world.php'
				}
				, {
					pathPrefix: '/cgi-bin/drupal'
					, directory: '/persist/drupal-7.95'
					, entrypoint: 'index.php'
				}
			]
		});
	});

	it('surfaces analyzePath failures instead of hanging on the status text', async () => {
		bus.analyzePath.mockRejectedValue({
			error: 'Timed out waiting for a service worker reply after 5000ms.'
			, action: 'analyzePath'
			, params: ['/persist/drupal-7.95']
		});

		render(<InstallDemo />);

		await screen.findByText(
			'Installer request "analyzePath" failed: Timed out waiting for a service worker reply after 5000ms.'
		);
	});
});
