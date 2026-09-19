import { getReadyPhpBus, runtimeReadyTimeoutMs, runtimeStartupRetryDelaysMs } from './phpRuntime';

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
		vi.useFakeTimers();
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
		const startup = getReadyPhpBus({onProgress});

		await vi.advanceTimersByTimeAsync(999);
		expect(recoverServiceWorker).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(startup).resolves.toBe(replacement);
		expect(recoverServiceWorker).toHaveBeenCalledExactlyOnceWith(controller);
		expect(replacement.runtimeReady).toHaveBeenCalledTimes(1);
		expect(onProgress.mock.calls.flat()).toEqual([
			'Retrying PHP startup in 1s (1 of 2)...'
			, 'Updating PHP runtime (1 of 2)...'
			, 'Restarting PHP runtime (1 of 2)...'
		]);
	});

	it('aborts missing replies, stops after two replacements, and permits a later retry', async () => {
		const request = Object.assign(new Promise(() => {}), {abort: vi.fn()});

		bus.runtimeReady.mockReturnValue(request);
		const result = expect(getReadyPhpBus()).rejects.toThrow('PHP could not start after 3 attempts. Timed out');

		const retryDelay = runtimeStartupRetryDelaysMs.reduce((total, delay) => total + delay, 0);

		await vi.advanceTimersByTimeAsync(3 * runtimeReadyTimeoutMs + retryDelay);
		await result;
		expect(request.abort).toHaveBeenCalledTimes(3);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
		bus.runtimeReady.mockResolvedValue(true);
		await expect(getReadyPhpBus()).resolves.toBe(bus);
	});

	it('stops after two failed replacements and retains all failure details', async () => {
		bus.runtimeReady.mockRejectedValue(new Error('missing Wasm'));
		recoverServiceWorker.mockRejectedValue(new Error('worker module returned 404'));
		const result = expect(getReadyPhpBus()).rejects.toMatchObject({
			message: 'PHP could not start after 3 attempts. worker module returned 404'
			, cause: {errors: [expect.anything(), expect.any(Error), expect.any(Error)]}
		});

		await vi.advanceTimersByTimeAsync(3000);
		await result;
		expect(bus.runtimeReady).toHaveBeenCalledTimes(1);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('automatically retries an initial registration error and a failed replacement for concurrent callers', async () => {
		navigator.serviceWorker.controller = null;
		getPhpBus.mockRejectedValueOnce(new Error('registration unavailable'));
		recoverServiceWorker.mockRejectedValueOnce(new Error('replacement unavailable'));
		const first = getReadyPhpBus();
		const second = getReadyPhpBus();

		await vi.advanceTimersByTimeAsync(1000);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(1);
		expect(bus.runtimeReady).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1999);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await expect(Promise.all([first, second])).resolves.toEqual([bus, bus]);
		expect(recoverServiceWorker).toHaveBeenCalledTimes(2);
		expect(bus.runtimeReady).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('explains unsupported browsers without scheduling futile retries', async () => {
		delete navigator.serviceWorker;

		await expect(getReadyPhpBus()).rejects.toThrow('does not support service workers');
		expect(getPhpBus).not.toHaveBeenCalled();
		expect(recoverServiceWorker).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('replaces the failed controller even when the page was initially uncontrolled', async () => {
		navigator.serviceWorker.controller = null;
		const controller = {};

		getPhpBus.mockImplementationOnce(async () => {
			navigator.serviceWorker.controller = controller;
			return bus;
		});
		bus.runtimeReady.mockRejectedValueOnce(new Error('missing Wasm'));
		const startup = getReadyPhpBus();

		await vi.advanceTimersByTimeAsync(1000);
		await expect(startup).resolves.toBe(bus);
		expect(recoverServiceWorker).toHaveBeenCalledExactlyOnceWith(controller);
	});

	it('never caches readiness for a worker that changed during the probe', async () => {
		bus.runtimeReady.mockImplementationOnce(async () => {
			navigator.serviceWorker.controller = {};
			return true;
		});

		const startup = getReadyPhpBus();

		await vi.advanceTimersByTimeAsync(1000);
		await expect(startup).resolves.toBe(bus);
		expect(bus.runtimeReady).toHaveBeenCalledTimes(2);
		await getReadyPhpBus();
		expect(bus.runtimeReady).toHaveBeenCalledTimes(2);
	});
});
