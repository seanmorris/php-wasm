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
});
