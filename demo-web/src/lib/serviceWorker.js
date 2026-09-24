/**
 * Service worker registration helpers for the CGI-backed demo runtime.
 */
import { basePath, baseUrlFor } from './runtimePaths';

export const serviceWorkerControlTimeoutMs = 1500;
export const serviceWorkerStartupTimeoutMs = 15000;

/**
 * Returns a serializable description of one worker slot.
 */
const describeWorker = worker => worker
	? {
		scriptURL: worker.scriptURL ?? null
		, state: worker.state ?? null
	}
	: null;

/**
 * Returns a serializable description of one service-worker registration.
 */
const describeRegistration = registration => registration
	? {
		scope: registration.scope ?? null
		, installing: describeWorker(registration.installing)
		, waiting: describeWorker(registration.waiting)
		, active: describeWorker(registration.active)
	}
	: null;

/**
 * Describes the browsing context without dereferencing a cross-origin opener.
 */
const describeContext = () => {
	let openerSameOrigin = null;
	let openerTopLevel = null;

	if(window.opener)
	{
		try
		{
			openerSameOrigin = window.opener.location.origin === window.location.origin;
		}
		catch
		{
			openerSameOrigin = false;
		}

		try
		{
			openerTopLevel = window.opener.top === window.opener;
		}
		catch
		{
			openerTopLevel = null;
		}
	}

	return {
		url: window.location.href
		, origin: window.location.origin
		, referrer: document.referrer
		, topLevel: window.top === window
		, hasOpener: Boolean(window.opener)
		, openerSameOrigin
		, openerTopLevel
	};
};

/**
 * Resolves a promise with an explicit timeout result instead of leaving startup pending forever.
 */
const settleWithin = (promise, timeoutMs) => {
	let timeout;

	return Promise.race([
		Promise.resolve(promise).then(value => ({timedOut: false, value}))
		, new Promise(resolve => {
			timeout = setTimeout(() => resolve({timedOut: true, value: null}), timeoutMs);
		})
	]).finally(() => clearTimeout(timeout));
};

/**
 * Keeps a recovered worker's registration URL on subsequent page loads, while
 * still checking its script graph for updates. Dropping its query would cause
 * another unnecessary worker replacement as soon as the user opens a new tab.
 */
const registrationUrl = () => {
	const workerUrl = baseUrlFor('cgi-worker.js');
	const scriptUrl = navigator.serviceWorker.controller?.scriptURL;
	const currentUrl = scriptUrl ? new URL(scriptUrl, window.location.origin) : null;

	if(currentUrl?.origin === workerUrl.origin && currentUrl.pathname === workerUrl.pathname)
	{
		workerUrl.search = currentUrl.search;
	}

	return workerUrl.href;
};

/**
 * Observes service-worker state changes until startup completes or fails.
 */
const observeRegistration = (registration, transitions, startedAt) => {
	const cleanups = [];
	const observedWorkers = new Set();

	const observeWorker = (slot, worker) => {
		if(!worker || observedWorkers.has(worker))
		{
			return;
		}

		observedWorkers.add(worker);

		const recordState = () => transitions.push({
			elapsedMs: Date.now() - startedAt
			, slot
			, ...describeWorker(worker)
		});

		recordState();
		worker.addEventListener?.('statechange', recordState);
		cleanups.push(() => worker.removeEventListener?.('statechange', recordState));
	};

	const observeSlots = () => {
		observeWorker('installing', registration?.installing);
		observeWorker('waiting', registration?.waiting);
		observeWorker('active', registration?.active);
	};

	const onUpdateFound = () => observeSlots();

	observeSlots();
	registration?.addEventListener?.('updatefound', onUpdateFound);
	cleanups.push(() => registration?.removeEventListener?.('updatefound', onUpdateFound));

	return () => cleanups.forEach(cleanup => cleanup());
};

/**
 * Builds the diagnostics attached to every startup result.
 */
const createDiagnostics = ({
	phase
	, registration
	, matchedRegistration
	, transitions
	, startedAt
}) => ({
	phase
	, elapsedMs: Date.now() - startedAt
	, context: describeContext()
	, controller: describeWorker(navigator.serviceWorker?.controller)
	, registration: describeRegistration(registration)
	, matchedRegistration: describeRegistration(matchedRegistration)
	, transitions: [...transitions]
});

/**
 * Formats a timeout with enough state to distinguish install, activation, and claim failures.
 */
const createTimeoutError = (phase, timeoutMs, diagnostics) => {
	const state = diagnostics.registration;
	const slots = state
		? `installing=${state.installing?.state ?? 'none'}, waiting=${state.waiting?.state ?? 'none'}, active=${state.active?.state ?? 'none'}`
		: 'registration=none';
	const error = new Error(
		`CGI service worker ${phase} timed out after ${timeoutMs}ms (${slots}, controller=${diagnostics.controller?.state ?? 'none'}).`
	);

	error.name = 'ServiceWorkerStartupTimeoutError';
	return error;
};

/**
 * Registers the CGI worker and waits briefly for page control when necessary.
 */
export const ensureServiceWorker = async ({
	timeoutMs = serviceWorkerControlTimeoutMs
	, startupTimeoutMs = serviceWorkerStartupTimeoutMs
} = {}) => {
	if(!('serviceWorker' in navigator))
	{
		return {
			supported: false
			, registered: false
			, controlled: false
			, controller: null
			, controlSource: 'unsupported'
			, error: null
			, registration: null
			, diagnostics: null
		};
	}

	const startedAt = Date.now();
	const transitions = [];
	let phase = 'register';
	let registration = null;
	let matchedRegistration = null;
	let stopObserving = () => {};

	const diagnostics = () => createDiagnostics({
		phase
		, registration
		, matchedRegistration
		, transitions
		, startedAt
	});

	const timeoutResult = (controlSource, registered) => {
		const startupDiagnostics = diagnostics();

		return {
			supported: true
			, registered
			, controlled: false
			, controller: navigator.serviceWorker.controller ?? null
			, controlSource
			, error: createTimeoutError(phase, startupTimeoutMs, startupDiagnostics)
			, registration
			, diagnostics: startupDiagnostics
		};
	};

	try
	{
		const registerResult = await settleWithin(
			navigator.serviceWorker.register(registrationUrl(), {
				type: 'module'
				, scope: basePath()
				, updateViaCache: 'none'
			})
			, startupTimeoutMs
		);

		if(registerResult.timedOut)
		{
			return timeoutResult('register-timeout', false);
		}

		registration = registerResult.value;
		stopObserving = observeRegistration(registration, transitions, startedAt);
		phase = 'registration-match';

		const matchResult = await settleWithin(
			navigator.serviceWorker.getRegistration(baseUrlFor().toString())
			, startupTimeoutMs
		);

		if(matchResult.timedOut)
		{
			return timeoutResult('registration-match-timeout', true);
		}

		matchedRegistration = matchResult.value ?? null;
		phase = 'ready';

		const readyResult = await settleWithin(
			navigator.serviceWorker.ready
			, startupTimeoutMs
		);

		if(readyResult.timedOut)
		{
			return timeoutResult('ready-timeout', true);
		}

		matchedRegistration = readyResult.value ?? matchedRegistration;
		phase = 'control';

		if(navigator.serviceWorker.controller)
		{
			return {
				supported: true
				, registered: true
				, controlled: true
				, controller: navigator.serviceWorker.controller
				, controlSource: 'existing'
				, error: null
				, registration
				, diagnostics: diagnostics()
			};
		}

		const controlled = await new Promise(resolve => {
			const onControllerChange = () => {
				clearTimeout(timeout);
				navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
				resolve(true);
			};

			const timeout = setTimeout(() => {
				navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
				resolve(false);
			}, timeoutMs);

			navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
				once: true
			});
		});

		return {
			supported: true
			, registered: true
			, controlled
			, controller: navigator.serviceWorker.controller ?? null
			, controlSource: controlled ? 'controllerchange' : 'timeout'
			, error: null
			, registration
			, diagnostics: diagnostics()
		};
	}
	catch(error)
	{
		return {
			supported: true
			, registered: false
			, controlled: false
			, controller: navigator.serviceWorker?.controller ?? null
			, controlSource: 'error'
			, error
			, registration
			, diagnostics: diagnostics()
		};
	}
	finally
	{
		stopObserving();
	}
};

/**
 * Replaces an unresponsive CGI worker once, without clearing persistent storage.
 * A distinct script URL also restarts a worker whose code has not changed.
 * Concurrent tabs reuse a replacement that has already taken control.
 * @param {ServiceWorker|null} controller The worker whose startup failed.
 * @param {number} timeoutMs Maximum time for the lock, registration and takeover.
 * @returns {Promise<ServiceWorker>} The replacement controlling this page.
 */
export const recoverServiceWorker = async (
	controller
	, timeoutMs = serviceWorkerStartupTimeoutMs
) => {
	const workerContainer = navigator.serviceWorker;
	const cancellation = new AbortController();
	let onControllerChange;
	let onAbort;

	const replaceWorker = async () => {
		cancellation.signal.throwIfAborted();

		if(workerContainer.controller && workerContainer.controller !== controller)
		{
			return workerContainer.controller;
		}

		return new Promise((resolve, reject) => {
			onControllerChange = () => {
				if(workerContainer.controller && workerContainer.controller !== controller)
				{
					resolve(workerContainer.controller);
				}
			};
			onAbort = () => reject(cancellation.signal.reason);

			workerContainer.addEventListener('controllerchange', onControllerChange);
			cancellation.signal.addEventListener('abort', onAbort, {once: true});
			const workerUrl = baseUrlFor('cgi-worker.js');

			workerUrl.searchParams.set('recovery', crypto.randomUUID());
			workerContainer.register(workerUrl.href, {
				type: 'module'
				, scope: basePath()
				, updateViaCache: 'none'
			}).then(onControllerChange, reject);
		});
	};

	try
	{
		const recovery = navigator.locks?.request
			? navigator.locks.request('php-wasm-worker-recovery', {
				signal: cancellation.signal
			}, replaceWorker)
			: replaceWorker();
		const result = await settleWithin(recovery, timeoutMs);

		if(result.timedOut)
		{
			throw new Error(`CGI service worker replacement timed out after ${timeoutMs}ms. Retry PHP startup when the connection is available.`);
		}

		return result.value;
	}
	finally
	{
		cancellation.abort();
		cancellation.signal.removeEventListener('abort', onAbort);
		workerContainer.removeEventListener('controllerchange', onControllerChange);
	}
};
