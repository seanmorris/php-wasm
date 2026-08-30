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
			navigator.serviceWorker.register(basePath('cgi-worker.js'), {
				type: 'module'
				, scope: basePath()
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
