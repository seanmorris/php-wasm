/**
 * Quickbus bootstrap helpers for talking to the CGI service worker.
 */
import { Client } from 'quickbus';
import {
	ensureServiceWorker,
	serviceWorkerControlTimeoutMs
} from './serviceWorker';

let cachedBus = null;
let cachedController = null;
let pendingBus = null;
const promiseMethodNames = new Set(['then', 'catch', 'finally']);

/**
 * Returns the active controlling service worker, if one exists.
 */
const activeController = () => navigator.serviceWorker?.controller ?? null;

/**
 * Creates a consistent error for RPC attempts made before a controller is ready.
 */
const createNoControllerError = () => new Error(
	'No active service worker was available for the CGI control request.'
);

/**
 * Wraps the quickbus client so the facade does not masquerade as a promise.
 */
const createPhpBusFacade = client => new Proxy({}, {
	get: (_, property) => {
		if(typeof property === 'string' && promiseMethodNames.has(property))
		{
			return undefined;
		}

		return Reflect.get(client, property, client);
	}
});

/**
 * Returns a cached service-worker bus once the CGI worker is controlling the page.
 */
export const getPhpBus = async ({timeoutMs = serviceWorkerControlTimeoutMs} = {}) => {
	const controller = activeController();

	if(cachedBus && controller && controller === cachedController)
	{
		return cachedBus;
	}

	if(controller)
	{
		cachedController = controller;
		cachedBus = createPhpBusFacade(Client.forServiceWorker(navigator.serviceWorker));
		return cachedBus;
	}

	if(pendingBus)
	{
		return pendingBus;
	}

	pendingBus = (async() => {
		const serviceWorker = await ensureServiceWorker({timeoutMs});
		const nextController = activeController();

		if(!serviceWorker.controlled || !nextController)
		{
			throw serviceWorker.error ?? createNoControllerError();
		}

		if(cachedBus && nextController === cachedController)
		{
			return cachedBus;
		}

		cachedController = nextController;
		cachedBus = createPhpBusFacade(Client.forServiceWorker(navigator.serviceWorker));

		return cachedBus;
	})().finally(() => {
		pendingBus = null;
	});

	return pendingBus;
};

/**
 * Normalizes thrown values into the shape used by installer and editor RPC errors.
 */
export const normalizePhpBusError = (error, action, params = []) => {
	if(error && typeof error === 'object' && 'error' in error && 'action' in error && 'params' in error)
	{
		return error;
	}

	return {
		error: error?.message ?? error?.error ?? String(error)
		, action
		, params
	};
};

/**
 * Creates a timeout-shaped RPC error payload for slow service worker requests.
 */
export const createPhpBusTimeoutError = (action, params = [], timeoutMs) => ({
	error: `Timed out waiting for a service worker reply after ${timeoutMs}ms.`
	, action
	, params
});

/**
 * Waits for a bus request to settle and optionally aborts it after a timeout.
 */
export const waitForPhpBusRequest = async (
	request
	, {action, params = [], timeoutMs} = {}
) => {
	if(timeoutMs === undefined)
	{
		try
		{
			return await request;
		}
		catch(error)
		{
			throw normalizePhpBusError(error, action, params);
		}
	}

	let timeout = null;

	try
	{
		return await Promise.race([
			request
			, new Promise((_, reject) => {
				timeout = setTimeout(() => {
					request.abort?.();
					reject(createPhpBusTimeoutError(action, params, timeoutMs));
				}, timeoutMs);
			})
		]);
	}
	catch(error)
	{
		if(error?.name === 'AbortError')
		{
			throw createPhpBusTimeoutError(action, params, timeoutMs);
		}

		throw normalizePhpBusError(error, action, params);
	}
	finally
	{
		if(timeout)
		{
			clearTimeout(timeout);
		}
	}
};
