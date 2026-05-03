import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const { ensureServiceWorker, sendMessageFor } = vi.hoisted(() => ({
	ensureServiceWorker: vi.fn()
	, sendMessageFor: vi.fn()
}));

vi.mock('./serviceWorker', () => ({
	ensureServiceWorker
	, serviceWorkerControlTimeoutMs: 1500
}));

vi.mock('php-cgi-wasm/msg-bus.mjs', () => ({
	sendMessageFor
}));

vi.mock('./Terminal', () => ({
	default: function TerminalMock() {
		return null;
	}
}));

import InstallDemo from './InstallDemo';

describe('InstallDemo', () => {
	let fetchMock;
	let sendMessage;
	let originalServiceWorker;
	let originalLocks;

	beforeEach(() => {
		ensureServiceWorker.mockReset();
		sendMessageFor.mockReset();

		sendMessage = vi.fn(async (command) => {
			switch(command)
			{
				case 'analyzePath':
					return {exists: false};

				case 'getSettings':
					return {vHosts: []};

				case 'writeFile':
				case 'setSettings':
				case 'storeInit':
					return undefined;

				default:
					throw new Error(`Unexpected command: ${command}`);
			}
		});

		sendMessageFor.mockReturnValue(sendMessage);

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

		await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('storeInit', [], {timeoutMs: 10000}));

		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('scripts/init.php'))).toHaveLength(1);
		expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/backups/drupal-7.95.zip'))).toHaveLength(1);
		expect(navigator.locks.request).toHaveBeenCalledTimes(1);
	});

	it('surfaces analyzePath failures instead of hanging on the status text', async () => {
		sendMessage.mockImplementation(async (command) => {
			switch(command)
			{
				case 'analyzePath':
					throw {
						error: 'Timed out waiting for a service worker reply after 5000ms.'
						, action: 'analyzePath'
						, params: ['/persist/drupal-7.95']
					};

				case 'getSettings':
					return {vHosts: []};

				case 'writeFile':
				case 'setSettings':
				case 'storeInit':
					return undefined;

				default:
					throw new Error(`Unexpected command: ${command}`);
			}
		});

		render(<InstallDemo />);

		await screen.findByText(
			'Installer request "analyzePath" failed: Timed out waiting for a service worker reply after 5000ms.'
		);
	});
});
