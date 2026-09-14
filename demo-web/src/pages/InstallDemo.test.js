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
			, awaitFilesystem: vi.fn(async () => true)
			, analyzePath: vi.fn(async () => ({exists: false}))
			, getSettings: vi.fn(async () => ({vHosts: []}))
			, readFile: vi.fn(async path => new TextEncoder().encode(
				path.endsWith('settings.php')
					? '<?php // settings'
					: '%2Fpersist%2Fdrupal-11.4.5%2Fweb'
			))
			, writeFile: vi.fn(async () => undefined)
			, unlink: vi.fn(async () => undefined)
			, setSettings: vi.fn(async () => undefined)
			, storeInit: vi.fn(async () => undefined)
			, refresh: vi.fn(async () => undefined)
			, replaceSql: vi.fn(async () => undefined)
			, runSql: vi.fn(async () => ({rows: [{ready: true}]}))
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

			if(String(url).endsWith('/backups/drupal-11.4.5-pgsql.sql'))
			{
				return {
					text: async () => 'CREATE TABLE drupal_demo (id integer);'
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

	it('installs the Drupal PostgreSQL variant with matching files and database identity', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11&database=pgsql');

		render(<InstallDemo />);

		await waitFor(() => expect(terminalProps.current).not.toBeNull());
		let installLockReleased = false;

		navigator.locks.request.mock.results[0].value.then(() => {
			installLockReleased = true;
		});
		await Promise.resolve();
		expect(installLockReleased).toBe(false);

		expect(bus.analyzePath).toHaveBeenCalledWith(
			'/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		);
		expect(bus.setSettings).not.toHaveBeenCalled();

		await act(async () => {
			await terminalProps.current.setExitCode(0);
		});

		const database = 'idb://host=drupal-11-pg18 dbname=postgres port=5432';
		const settingsWrite = bus.writeFile.mock.calls.find(([path]) => (
			path === '/persist/drupal-11.4.5-pgsql/web/sites/default/settings.php'
		));
		const templateWrite = bus.writeFile.mock.calls.find(([path]) => (
			path.endsWith('/core/themes/olivero/templates/includes/get-started.html.twig')
		));

		expect(settingsWrite).toBeDefined();
		expect(new TextDecoder().decode(settingsWrite[1])).toContain(
			"'host' => 'drupal-11-pg18'"
		);
		expect(new TextDecoder().decode(settingsWrite[1])).toContain(
			"'database' => 'postgres'"
		);
		expect(new TextDecoder().decode(settingsWrite[1])).toContain(
			'set_time_limit(180);'
		);
		expect(templateWrite).toBeDefined();
		expect(new TextDecoder().decode(templateWrite[1])).toContain(
			'%2Fpersist%2Fdrupal-11.4.5-pgsql%2Fweb'
		);
		expect(fetchMock.mock.calls.some(([url]) => (
			String(url).endsWith('/backups/drupal-11.4.5-pgsql.sql')
		))).toBe(true);
		expect(bus.replaceSql).toHaveBeenCalledWith(
			database
			, 'CREATE TABLE drupal_demo (id integer);'
		);
		expect(bus.runSql).not.toHaveBeenCalled();
		expect(bus.setSettings).toHaveBeenCalledWith({
			vHosts: [
				{
					pathPrefix: '/cgi-bin/drupal'
					, directory: '/persist/drupal-11.4.5-pgsql/web'
					, entrypoint: 'index.php'
				}
			]
		});
		const markerWrite = bus.writeFile.mock.calls.find(([path]) => (
			path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		));

		expect(markerWrite).toBeDefined();
		expect(new TextDecoder().decode(markerWrite[1])).toBe('complete\n');
		expect(bus.awaitFilesystem).toHaveBeenCalledTimes(1);
		expect(bus.refresh).not.toHaveBeenCalled();
		await waitFor(() => expect(installLockReleased).toBe(true));
	});

	it('keeps SQLite as the default Drupal backend', async () => {
		render(<InstallDemo />);

		await waitFor(() => expect(terminalProps.current).not.toBeNull());

		await act(async () => {
			await terminalProps.current.setExitCode(0);
		});

		expect(bus.analyzePath).toHaveBeenCalledWith('/persist/drupal-11.4.5/web');
		expect(bus.replaceSql).not.toHaveBeenCalled();
	});

	it('rejects an unsupported Drupal database option', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11&database=mysql');

		render(<InstallDemo />);

		await screen.findByText('Invalid database selected.');
		expect(bus.runtimeReady).not.toHaveBeenCalled();
		expect(bus.analyzePath).not.toHaveBeenCalled();
	});

	it('rejects inherited object keys as Drupal database options', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11&database=constructor');

		render(<InstallDemo />);

		await screen.findByText('Invalid database selected.');
		expect(bus.runtimeReady).not.toHaveBeenCalled();
		expect(bus.analyzePath).not.toHaveBeenCalled();
	});

	it('reactivates an existing PostgreSQL Drupal install before opening it', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11&database=pgsql');
		bus.analyzePath.mockResolvedValue({exists: true});

		render(<InstallDemo />);

		await waitFor(() => expect(bus.awaitFilesystem).toHaveBeenCalledTimes(1));

		expect(bus.refresh).not.toHaveBeenCalled();
		expect(bus.runSql).toHaveBeenCalledWith(
			'idb://host=drupal-11-pg18 dbname=postgres port=5432'
			, expect.stringContaining("to_regclass('public.users_field_data')")
		);
		expect(bus.setSettings).toHaveBeenCalledWith({
			vHosts: [
				{
					pathPrefix: '/cgi-bin/drupal'
					, directory: '/persist/drupal-11.4.5-pgsql/web'
					, entrypoint: 'index.php'
				}
			]
		});
		expect(terminalProps.current).toBeNull();
		expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('.zip'))).toBe(false);
	});

	it('reinstalls PostgreSQL when a restored marker has no matching database', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11&database=pgsql');
		bus.analyzePath.mockResolvedValue({exists: true});
		bus.runSql.mockResolvedValue({rows: [{ready: false}]});

		render(<InstallDemo />);

		await waitFor(() => expect(terminalProps.current).not.toBeNull());

		expect(bus.unlink).toHaveBeenCalledWith(
			'/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		);
		expect(fetchMock.mock.calls.some(([url]) => (
			String(url).endsWith('/backups/drupal-11.4.5.zip')
		))).toBe(true);
		expect(bus.setSettings).not.toHaveBeenCalled();
	});

	it('surfaces a PostgreSQL import failure without refreshing CGI', async () => {
		window.history.pushState({}, '', '/install-demo.html?framework=drupal-11&database=pgsql');
		bus.replaceSql.mockRejectedValue({
			action: 'replaceSql'
			, error: 'Could not import the Drupal snapshot.'
		});

		render(<InstallDemo />);

		await waitFor(() => expect(terminalProps.current).not.toBeNull());
		await act(async () => {
			await terminalProps.current.setExitCode(0);
		});

		await screen.findByText(
			'Installer request "replaceSql" failed: Could not import the Drupal snapshot.'
		);
		expect(bus.writeFile.mock.calls.some(([path]) => (
			path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		))).toBe(false);
		expect(bus.setSettings).not.toHaveBeenCalled();
		expect(bus.refresh).not.toHaveBeenCalled();
	});

	it('clears an existing PostgreSQL marker before a failed overwrite', async () => {
		window.history.pushState(
			{}
			, ''
			, '/install-demo.html?framework=drupal-11&database=pgsql&overwrite=true'
		);
		bus.analyzePath.mockResolvedValue({exists: true});
		bus.replaceSql.mockRejectedValue({
			action: 'replaceSql'
			, error: 'Could not import the Drupal snapshot.'
		});

		render(<InstallDemo />);

		await waitFor(() => expect(terminalProps.current).not.toBeNull());
		expect(bus.unlink).toHaveBeenCalledWith(
			'/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		);
		expect(bus.runSql).not.toHaveBeenCalled();

		await act(async () => {
			await terminalProps.current.setExitCode(0);
		});

		await screen.findByText(
			'Installer request "replaceSql" failed: Could not import the Drupal snapshot.'
		);
		expect(bus.writeFile.mock.calls.some(([path]) => (
			path === '/persist/drupal-11.4.5-pgsql/.php-wasm-install-complete'
		))).toBe(false);
		expect(bus.setSettings).not.toHaveBeenCalled();
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
