import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

const { ensureServiceWorker, getPhpBus, terminalProps } = vi.hoisted(() => ({
	ensureServiceWorker: vi.fn()
	, getPhpBus: vi.fn()
	, terminalProps: {current: null}
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
	default: function TerminalMock(props) {
		terminalProps.current = props;
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
		terminalProps.current = null;

		bus = {
			runtimeReady: vi.fn(async () => true)
			, analyzePath: vi.fn(async () => ({exists: false}))
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

			if(String(url).includes('/backups/') && String(url).endsWith('.zip'))
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
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
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
		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/backups/drupal-11.4.5.zip'))).toHaveLength(1);
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
					, directory: '/persist/drupal-11.4.5/web'
					, entrypoint: 'index.php'
				}
			]
		});
	});

	it('installs the WordPress package at its CGI vhost and persistent docroot', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=wordpress-7.1');

		render(<InstallDemo />);

		await waitFor(() => expect(bus.storeInit).toHaveBeenCalledTimes(1));

		expect(bus.analyzePath).toHaveBeenCalledWith('/persist/wordpress-7.1');
		expect(fetchMock.mock.calls.some(([url]) => (
			String(url).includes('/backups/wordpress-7.1.zip')
		))).toBe(true);
		expect(bus.setSettings).toHaveBeenCalledWith({
			vHosts: [
				{
					pathPrefix: '/cgi-bin/wordpress'
					, directory: '/persist/wordpress-7.1'
					, entrypoint: 'index.php'
				}
			]
		});
	});

	it('surfaces analyzePath failures instead of hanging on the status text', async () => {
		bus.analyzePath.mockRejectedValue({
			error: 'Timed out waiting for a service worker reply after 5000ms.'
			, action: 'analyzePath'
			, params: ['/persist/drupal-11.4.5/web']
		});

		render(<InstallDemo />);

		await screen.findByText(
			'Installer request "analyzePath" failed: Timed out waiting for a service worker reply after 5000ms.'
		);
	});

	it('waits for the cold PHP runtime before using short filesystem RPC timeouts', async () => {
		let markRuntimeReady;
		const runtimeReady = new Promise(resolve => markRuntimeReady = resolve);

		bus.runtimeReady.mockReturnValue(runtimeReady);

		render(<InstallDemo />);

		await screen.findByText('Starting PHP runtime...');
		expect(bus.runtimeReady).toHaveBeenCalledTimes(1);
		expect(bus.analyzePath).not.toHaveBeenCalled();

		markRuntimeReady(true);

		await waitFor(() => expect(bus.analyzePath).toHaveBeenCalledTimes(1));
	});

	it('surfaces service-worker startup state instead of waiting indefinitely', async () => {
		const diagnostics = {
			phase: 'ready'
			, registration: {
				installing: {state: 'redundant'}
				, waiting: null
				, active: null
			}
		};
		const error = new Error(
			'CGI service worker ready timed out after 15000ms (installing=redundant, waiting=none, active=none, controller=none).'
		);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		ensureServiceWorker.mockResolvedValue({
			supported: true
			, registered: true
			, controlled: false
			, controller: null
			, controlSource: 'ready-timeout'
			, error
			, diagnostics
		});

		render(<InstallDemo />);

		await screen.findByText(error.message);
		expect(getPhpBus).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(
			'CGI service worker startup failed.'
			, {
				controlSource: 'ready-timeout'
				, error
				, diagnostics
			}
		);
	});

	it('surfaces a failed archive extraction instead of leaving the installer blank', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=codeigniter-4');

		render(<InstallDemo />);

		await waitFor(() => expect(terminalProps.current).not.toBeNull());

		await act(async () => {
			await terminalProps.current.setExitCode(1);
		});

		await screen.findByText(
			'Could not unpack /backups/codeigniter-4.zip (PHP CLI exited with code 1).'
		);
	});
});
