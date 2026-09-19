import { ensureServiceWorker, recoverServiceWorker } from './serviceWorker';

describe('ensureServiceWorker', () => {
	let originalServiceWorker;

	beforeEach(() => {
		originalServiceWorker = navigator.serviceWorker;
	});

	afterEach(() => {
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

		vi.useRealTimers();
	});

	it('returns the existing controller when the page is already controlled', async () => {
		const controller = {scriptURL: '/php-wasm/cgi-worker.js'};
		const serviceWorker = {
			controller
			, register: vi.fn().mockResolvedValue({scope: '/php-wasm/'})
			, getRegistration: vi.fn().mockResolvedValue({scope: '/php-wasm/'})
			, ready: Promise.resolve({scope: '/php-wasm/'})
			, addEventListener: vi.fn()
			, removeEventListener: vi.fn()
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		await expect(ensureServiceWorker()).resolves.toMatchObject({
			supported: true
			, registered: true
			, controlled: true
			, controller
			, controlSource: 'existing'
		});
	});

	it('checks a recovered worker for updates without switching its registration URL back', async () => {
		const scriptURL = new URL('/cgi-worker.js?recovery=previous-attempt', window.location.origin).href;
		const serviceWorker = {
			controller: {scriptURL}
			, register: vi.fn().mockResolvedValue({})
			, getRegistration: vi.fn().mockResolvedValue({})
			, ready: Promise.resolve({})
		};

		Object.defineProperty(navigator, 'serviceWorker', {configurable: true, value: serviceWorker});
		await expect(ensureServiceWorker()).resolves.toMatchObject({controlled: true});
		expect(serviceWorker.register).toHaveBeenCalledWith(scriptURL, {
			type: 'module'
			, scope: '/'
			, updateViaCache: 'none'
		});
	});

	it('waits for a controllerchange when the worker takes control after registration', async () => {
		let onControllerChange;
		let resolveReady;
		const serviceWorker = {
			controller: null
			, register: vi.fn().mockResolvedValue({scope: '/php-wasm/'})
			, getRegistration: vi.fn().mockResolvedValue({scope: '/php-wasm/'})
			, ready: new Promise(resolve => {
				resolveReady = resolve;
			})
			, addEventListener: vi.fn((eventName, listener) => {
				if(eventName === 'controllerchange')
				{
					onControllerChange = listener;
				}
			})
			, removeEventListener: vi.fn()
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		const ensurePromise = ensureServiceWorker({timeoutMs: 50});

		await Promise.resolve();
		resolveReady({scope: '/php-wasm/'});
		await vi.waitFor(() => expect(onControllerChange).toBeTypeOf('function'));

		serviceWorker.controller = {scriptURL: '/php-wasm/cgi-worker.js'};
		onControllerChange();

		await expect(ensurePromise).resolves.toMatchObject({
			supported: true
			, registered: true
			, controlled: true
			, controlSource: 'controllerchange'
		});
	});

	it('times out cleanly when the worker never takes control', async () => {
		vi.useFakeTimers();

		const serviceWorker = {
			controller: null
			, register: vi.fn().mockResolvedValue({scope: '/php-wasm/'})
			, getRegistration: vi.fn().mockResolvedValue({scope: '/php-wasm/'})
			, ready: Promise.resolve({scope: '/php-wasm/'})
			, addEventListener: vi.fn()
			, removeEventListener: vi.fn()
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		const ensurePromise = ensureServiceWorker({timeoutMs: 50});

		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(50);

		await expect(ensurePromise).resolves.toMatchObject({
			supported: true
			, registered: true
			, controlled: false
			, controlSource: 'timeout'
		});
	});

	it('times out ready with serializable worker-state diagnostics', async () => {
		vi.useFakeTimers();

		let onStateChange;
		const installing = {
			scriptURL: '/php-wasm/cgi-worker.js'
			, state: 'installing'
			, addEventListener: vi.fn((eventName, listener) => {
				if(eventName === 'statechange')
				{
					onStateChange = listener;
				}
			})
			, removeEventListener: vi.fn()
		};
		const registration = {
			scope: '/php-wasm/'
			, installing
			, waiting: null
			, active: null
			, addEventListener: vi.fn()
			, removeEventListener: vi.fn()
		};
		const serviceWorker = {
			controller: null
			, register: vi.fn().mockResolvedValue(registration)
			, getRegistration: vi.fn().mockResolvedValue(registration)
			, ready: new Promise(() => {})
			, addEventListener: vi.fn()
			, removeEventListener: vi.fn()
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		const ensurePromise = ensureServiceWorker({startupTimeoutMs: 50});

		await vi.advanceTimersByTimeAsync(0);
		expect(onStateChange).toBeTypeOf('function');

		installing.state = 'redundant';
		onStateChange();
		await vi.advanceTimersByTimeAsync(50);

		const result = await ensurePromise;

		expect(result).toMatchObject({
			supported: true
			, registered: true
			, controlled: false
			, controlSource: 'ready-timeout'
			, diagnostics: {
				phase: 'ready'
				, registration: {
					installing: {
						scriptURL: '/php-wasm/cgi-worker.js'
						, state: 'redundant'
					}
					, waiting: null
					, active: null
				}
				, controller: null
			}
		});
		expect(result.error).toMatchObject({
			name: 'ServiceWorkerStartupTimeoutError'
		});
		expect(result.error.message).toContain('installing=redundant');
		expect(result.diagnostics.transitions).toMatchObject([
			{slot: 'installing', state: 'installing'}
			, {slot: 'installing', state: 'redundant'}
		]);
	});

	it('times out a registration call that never settles', async () => {
		vi.useFakeTimers();

		const serviceWorker = {
			controller: null
			, register: vi.fn(() => new Promise(() => {}))
			, getRegistration: vi.fn()
			, ready: new Promise(() => {})
		};

		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true
			, value: serviceWorker
		});

		const ensurePromise = ensureServiceWorker({startupTimeoutMs: 50});

		await vi.advanceTimersByTimeAsync(50);

		await expect(ensurePromise).resolves.toMatchObject({
			registered: false
			, controlled: false
			, controlSource: 'register-timeout'
			, diagnostics: {
				phase: 'register'
				, registration: null
			}
		});
		expect(serviceWorker.getRegistration).not.toHaveBeenCalled();
	});
});

describe('recoverServiceWorker', () => {
	let container;
	let controller;

	beforeEach(() => {
		controller = {scriptURL: '/cgi-worker.js'};
		container = Object.assign(new EventTarget(), {
			controller
			, register: vi.fn().mockResolvedValue({unregister: vi.fn()})
		});
		vi.spyOn(container, 'removeEventListener');
		vi.stubGlobal('navigator', {serviceWorker: container});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('forces a fresh worker without unregistering or clearing storage, even if takeover races registration', async () => {
		const unregister = vi.fn();
		const replacement = {};

		container.register.mockImplementation(async () => {
			container.controller = replacement;
			container.dispatchEvent(new Event('controllerchange'));
			return {unregister};
		});

		await expect(recoverServiceWorker(controller)).resolves.toBe(replacement);
		const [url, options] = container.register.mock.calls[0];

		expect(new URL(url).pathname).toBe('/cgi-worker.js');
		expect(new URL(url).searchParams.get('recovery')).toBeTruthy();
		expect(options).toEqual({type: 'module', scope: '/', updateViaCache: 'none'});
		expect(unregister).not.toHaveBeenCalled();
		expect(container.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
	});

	it('reuses a replacement installed by another tab', async () => {
		container.controller = {};

		await expect(recoverServiceWorker(controller)).resolves.toBe(container.controller);
		expect(container.register).not.toHaveBeenCalled();
	});

	it('propagates a broken module graph and removes its listener', async () => {
		container.register.mockRejectedValue(new Error('worker module returned 404'));

		await expect(recoverServiceWorker(controller)).rejects.toThrow('worker module returned 404');
		expect(container.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
	});

	it.each(['registration', 'takeover'])('bounds a stalled %s and releases the recovery lock', async phase => {
		vi.useFakeTimers();
		let held = false;

		navigator.locks = {
			request: vi.fn(async (_, options, callback) => {
				held = true;

				try
				{
					return await callback();
				}
				finally
				{
					held = false;
				}
			})
		};

		if(phase === 'registration')
		{
			container.register.mockReturnValue(new Promise(() => {}));
		}

		const result = expect(recoverServiceWorker(controller, 50)).rejects.toThrow('replacement timed out');

		await vi.advanceTimersByTimeAsync(50);
		await result;
		expect(held).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		expect(container.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
	});

	it('cancels a queued recovery without replacing the worker later', async () => {
		vi.useFakeTimers();
		let signal;

		navigator.locks = {
			request: vi.fn((_, options) => new Promise((resolve, reject) => {
				signal = options.signal;
				signal.addEventListener('abort', () => reject(signal.reason));
			}))
		};
		const result = expect(recoverServiceWorker(controller, 50)).rejects.toThrow('replacement timed out');

		await vi.advanceTimersByTimeAsync(50);
		await result;
		expect(signal.aborted).toBe(true);
		expect(container.register).not.toHaveBeenCalled();
	});
});
