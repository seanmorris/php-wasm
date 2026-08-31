import { ensureServiceWorker } from './serviceWorker';

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
