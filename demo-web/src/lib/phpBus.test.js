import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { Client, ensureServiceWorker } = vi.hoisted(() => ({
	Client: {
		forServiceWorker: vi.fn()
	}
	, ensureServiceWorker: vi.fn()
}));

vi.mock('quickbus', () => ({
	Client
}));

vi.mock('./serviceWorker', () => ({
	ensureServiceWorker
	, serviceWorkerControlTimeoutMs: 1500
}));

describe('phpBus', () => {
	let getPhpBus;
	let waitForPhpBusRequest;
	let originalServiceWorker;

	beforeEach(async () => {
		vi.resetModules();
		Client.forServiceWorker.mockReset();
		ensureServiceWorker.mockReset();
		({getPhpBus, waitForPhpBusRequest} = await import('./phpBus'));

		originalServiceWorker = navigator.serviceWorker;
	});

	afterEach(() => {
		vi.useRealTimers();

		if(originalServiceWorker === undefined)
		{
			delete navigator.serviceWorker;
			return;
		}

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: originalServiceWorker
		});
	});

	it('waits for service-worker control before creating the client', async () => {
		const controller = {scriptURL: '/php-wasm/cgi-worker.js'};
		const bus = {readFile: vi.fn()};
		const serviceWorker = {
			controller: null
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		ensureServiceWorker.mockImplementation(async () => {
			serviceWorker.controller = controller;

			return {
				controlled: true
				, error: null
			};
		});
		Client.forServiceWorker.mockReturnValue(bus);

		const resolvedBus = await getPhpBus();

		expect(resolvedBus).not.toBe(bus);
		expect(resolvedBus.readFile).toBe(bus.readFile);

		expect(ensureServiceWorker).toHaveBeenCalledTimes(1);
		expect(Client.forServiceWorker).toHaveBeenCalledTimes(1);
	});

	it('caches the current service-worker client', async () => {
		const controller = {scriptURL: '/php-wasm/cgi-worker.js'};
		const bus = {readFile: vi.fn()};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: {
				controller
			}
		});

		ensureServiceWorker.mockResolvedValue({
			controlled: true
			, error: null
		});
		Client.forServiceWorker.mockReturnValue(bus);

		const firstBus = await getPhpBus();
		const secondBus = await getPhpBus();

		expect(firstBus).toBe(secondBus);
		expect(firstBus).not.toBe(bus);
		expect(firstBus.readFile).toBe(bus.readFile);

		expect(ensureServiceWorker).not.toHaveBeenCalled();
		expect(Client.forServiceWorker).toHaveBeenCalledTimes(1);
	});

	it('rebuilds the client after the controller changes', async () => {
		const firstController = {scriptURL: '/php-wasm/cgi-worker.js'};
		const secondController = {scriptURL: '/php-wasm/cgi-worker.js?next=1'};
		const firstBus = {readFile: vi.fn()};
		const secondBus = {readFile: vi.fn()};
		const serviceWorker = {controller: firstController};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		Client.forServiceWorker
			.mockReturnValueOnce(firstBus)
			.mockReturnValueOnce(secondBus);

		const firstFacade = await getPhpBus();

		serviceWorker.controller = secondController;

		const secondFacade = await getPhpBus();

		expect(firstFacade).not.toBe(secondFacade);
		expect(firstFacade.readFile).toBe(firstBus.readFile);
		expect(secondFacade.readFile).toBe(secondBus.readFile);

		expect(ensureServiceWorker).not.toHaveBeenCalled();
		expect(Client.forServiceWorker).toHaveBeenCalledTimes(2);
	});

	it('returns a non-thenable facade from the async client getter', async () => {
		const controller = {scriptURL: '/php-wasm/cgi-worker.js'};
		const bus = {
			readFile: vi.fn()
			, then: vi.fn()
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: {
				controller
			}
		});

		Client.forServiceWorker.mockReturnValue(bus);

		const resolvedBus = await getPhpBus();

		expect(resolvedBus.then).toBeUndefined();
		await expect(Promise.resolve(resolvedBus)).resolves.toBe(resolvedBus);
		expect(bus.then).not.toHaveBeenCalled();
	});

	it('aborts caller-owned timeout races and reports the action metadata', async () => {
		vi.useFakeTimers();

		const request = {
			abort: vi.fn()
		};
		const pending = new Promise(() => {});

		request.then = pending.then.bind(pending);
		request.catch = pending.catch.bind(pending);
		request.finally = pending.finally.bind(pending);

		const resultPromise = waitForPhpBusRequest(request, {
			action: 'analyzePath'
			, params: ['/persist/drupal-7.95']
			, timeoutMs: 25
		});
		const rejection = expect(resultPromise).rejects.toMatchObject({
			action: 'analyzePath'
			, params: ['/persist/drupal-7.95']
			, error: 'Timed out waiting for a service worker reply after 25ms.'
		});

		await vi.advanceTimersByTimeAsync(25);

		await rejection;
		expect(request.abort).toHaveBeenCalledTimes(1);
	});
});
