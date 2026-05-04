import { Client } from 'quickbus';
import {
	ensureServiceWorker,
	serviceWorkerControlTimeoutMs
} from './serviceWorker';

let cachedBus = null;
let cachedController = null;
let pendingBus = null;
const promiseMethodNames = new Set(['then', 'catch', 'finally']);

const activeController = () => navigator.serviceWorker?.controller ?? null;

const createNoControllerError = () => new Error(
	'No active service worker was available for the CGI control request.'
);

const createPhpBusFacade = client => new Proxy({}, {
	get: (_, property) => {
		if(typeof property === 'string' && promiseMethodNames.has(property))
		{
			return undefined;
		}

		return Reflect.get(client, property, client);
	}
});

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

export const createPhpBusTimeoutError = (action, params = [], timeoutMs) => ({
	error: `Timed out waiting for a service worker reply after ${timeoutMs}ms.`
	, action
	, params
});

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
