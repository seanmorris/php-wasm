import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { defaultMessageTimeoutMs, onMessage, sendMessageFor } from 'php-cgi-wasm/msg-bus.mjs';

class FakeServiceWorker extends EventTarget
{
	constructor(scriptURL, state = 'activated')
	{
		super();
		this.scriptURL = scriptURL;
		this.state = state;
		this.postMessage = vi.fn();
	}
}

describe('sendMessageFor', () => {
	let originalServiceWorker;
	let originalServiceWorkerClass;

	beforeEach(() => {
		originalServiceWorker = navigator.serviceWorker;
		originalServiceWorkerClass = globalThis.ServiceWorker;
		globalThis.ServiceWorker = FakeServiceWorker;
	});

	afterEach(() => {
		vi.useRealTimers();

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

		if(originalServiceWorkerClass === undefined)
		{
			delete globalThis.ServiceWorker;
		}
		else
		{
			globalThis.ServiceWorker = originalServiceWorkerClass;
		}
	});

	it('prefers the current controller over a stale worker handle', async () => {
		const staleWorker = new FakeServiceWorker('http://localhost/php-wasm/cgi-worker.js', 'redundant');
		const activeController = new FakeServiceWorker('http://localhost/php-wasm/cgi-worker.js', 'activated');

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: {
				controller: activeController
				, getRegistration: vi.fn().mockResolvedValue(null)
			}
		});

		const sendMessage = sendMessageFor(staleWorker, {timeoutMs: 100});
		const resultPromise = sendMessage('analyzePath', ['/persist/drupal-7.95']);

		await waitFor(() => expect(activeController.postMessage).toHaveBeenCalledTimes(1));
		expect(staleWorker.postMessage).not.toHaveBeenCalled();

		const [{token}] = activeController.postMessage.mock.calls[0];
		onMessage({data: {re: token, result: {exists: false}}});

		await expect(resultPromise).resolves.toEqual({exists: false});
	});

	it('rejects when the worker never replies', async () => {
		vi.useFakeTimers();

		const activeController = new FakeServiceWorker('http://localhost/php-wasm/cgi-worker.js', 'activated');

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: {
				controller: activeController
				, getRegistration: vi.fn().mockResolvedValue(null)
			}
		});

		const sendMessage = sendMessageFor(activeController, {timeoutMs: 25});
		const resultPromise = sendMessage('analyzePath', ['/persist/drupal-7.95']);
		const rejection = expect(resultPromise).rejects.toMatchObject({
			action: 'analyzePath'
			, params: ['/persist/drupal-7.95']
			, error: `Timed out waiting for a service worker reply after 25ms.`
		});

		await vi.advanceTimersByTimeAsync(25);

		await rejection;
		expect(defaultMessageTimeoutMs).toBe(5000);
	});
});
