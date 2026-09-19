import { getReadyPhpBus, runtimeReadyTimeoutMs } from './phpRuntime';

const { getPhpBus, recoverServiceWorker } = vi.hoisted(() => ({
	getPhpBus: vi.fn()
	, recoverServiceWorker: vi.fn()
}));

vi.mock('./phpBus', async importOriginal => ({
	...await importOriginal()
	, getPhpBus
}));
vi.mock('./serviceWorker', () => ({recoverServiceWorker}));

describe('CGI runtime startup recovery', () => {
	let bus;

	beforeEach(() => {
		vi.stubGlobal('navigator', {serviceWorker: {controller: {}}});
		bus = {runtimeReady: vi.fn().mockResolvedValue(true)};
		getPhpBus.mockReset().mockResolvedValue(bus);
		recoverServiceWorker.mockReset().mockImplementation(async () => {
			navigator.serviceWorker.controller = {};
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('shares readiness across callers and probes again when the controller changes', async () => {
		const results = await Promise.all([getReadyPhpBus(), getReadyPhpBus()]);

		expect(results).toEqual([bus, bus]);
		await expect(getReadyPhpBus()).resolves.toBe(bus);
		expect(bus.runtimeReady).toHaveBeenCalledTimes(1);
		navigator.serviceWorker.controller = {};
		await expect(getReadyPhpBus()).resolves.toBe(bus);
		expect(bus.runtimeReady).toHaveBeenCalledTimes(2);
		expect(recoverServiceWorker).not.toHaveBeenCalled();
	});

	it('replaces a failed worker once and returns the replacement bus', async () => {
		const controller = navigator.serviceWorker.controller;
		const replacement = {runtimeReady: vi.fn().mockResolvedValue(true)};
		const onProgress = vi.fn();

		bus.runtimeReady.mockRejectedValue(new Error('Wasm asset returned 404'));
		getPhpBus.mockResolvedValueOnce(bus).mockResolvedValue(replacement);
		await expect(getReadyPhpBus({onProgress})).resolves.toBe(replacement);
		expect(recoverServiceWorker).toHaveBeenCalledExactlyOnceWith(controller);
		expect(replacement.runtimeReady).toHaveBeenCalledTimes(1);
		expect(onProgress.mock.calls.flat()).toEqual([
			'Updating PHP runtime...'
			, 'Restarting PHP runtime...'
		]);
	});

	it('aborts missing replies, stops after one replacement, and permits a later retry', async () => {
		vi.useFakeTimers();
		const request = Object.assign(new Promise(() => {}), {abort: vi.fn()});

		bus.runtimeReady.mockReturnValue(request);
		const result = expect(getReadyPhpBus()).rejects.toThrow('PHP could not start after updating. Timed out');

		await vi.advanceTimersByTimeAsync(2 * runtimeReadyTimeoutMs);
		await result;
		expect(request.abort).toHaveBeenCalledTimes(2);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
		bus.runtimeReady.mockResolvedValue(true);
		await expect(getReadyPhpBus()).resolves.toBe(bus);
	});

	it('reports registration failures without another probe or an automatic retry loop', async () => {
		bus.runtimeReady.mockRejectedValue(new Error('missing Wasm'));
		recoverServiceWorker.mockRejectedValue(new Error('worker module returned 404'));

		await expect(getReadyPhpBus()).rejects.toThrow('worker module returned 404');
		expect(bus.runtimeReady).toHaveBeenCalledTimes(1);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(1);
	});

	it('replaces the failed controller even when the page was initially uncontrolled', async () => {
		navigator.serviceWorker.controller = null;
		const controller = {};

		getPhpBus.mockImplementationOnce(async () => {
			navigator.serviceWorker.controller = controller;
			return bus;
		});
		bus.runtimeReady.mockRejectedValueOnce(new Error('missing Wasm'));
		await expect(getReadyPhpBus()).resolves.toBe(bus);
		expect(recoverServiceWorker).toHaveBeenCalledExactlyOnceWith(controller);
	});

	it('never caches readiness for a worker that changed during the probe', async () => {
		bus.runtimeReady.mockImplementationOnce(async () => {
			navigator.serviceWorker.controller = {};
			return true;
		});

		await expect(getReadyPhpBus()).resolves.toBe(bus);
		expect(bus.runtimeReady).toHaveBeenCalledTimes(2);
		await getReadyPhpBus();
		expect(bus.runtimeReady).toHaveBeenCalledTimes(2);
	});
});
