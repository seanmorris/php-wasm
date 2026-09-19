/**
 * Bounded, read-only startup for pages using the shared CGI runtime.
 */
import { getPhpBus, waitForPhpBusRequest } from './phpBus';
import { recoverServiceWorker } from './serviceWorker';

export const runtimeReadyTimeoutMs = 15000;

let readyBus = null;
let readyController = null;
let pending = null;

/**
 * Checks readiness before callers issue any filesystem or installation mutations.
 */
const probeRuntime = async bus => {
	const controller = navigator.serviceWorker?.controller;

	await waitForPhpBusRequest(bus.runtimeReady(), {
		action: 'runtimeReady'
		, timeoutMs: runtimeReadyTimeoutMs
	});

	if(!controller || navigator.serviceWorker.controller !== controller)
	{
		throw new Error('The CGI service worker changed while PHP was starting. Retry PHP startup.');
	}

	return {bus, controller};
};

/**
 * Shares one startup attempt per page and caches readiness for its controller.
 * A failed or timed-out probe gets one fresh worker and one more probe. Only
 * readiness is retried; callers retain responsibility for their own mutations.
 * @param {{onProgress?: (message: string) => void}} options Startup status callback.
 * @returns {Promise<object>} The ready CGI control bus.
 */
export const getReadyPhpBus = async ({onProgress = () => {}} = {}) => {
	const controller = navigator.serviceWorker?.controller;

	if(readyBus && controller && controller === readyController)
	{
		return readyBus;
	}

	if(pending)
	{
		return pending;
	}

	pending = (async () => {
		let ready;
		let startupController = controller;

		try
		{
			const bus = await getPhpBus();

			startupController = navigator.serviceWorker?.controller;
			ready = await probeRuntime(bus);
		}
		catch(startupError)
		{
			try
			{
				onProgress('Updating PHP runtime...');
				await recoverServiceWorker(startupController);
				onProgress('Restarting PHP runtime...');
				ready = await probeRuntime(await getPhpBus());
			}
			catch(error)
			{
				const detail = error?.error ?? error?.message ?? String(error);

				throw new Error(`PHP could not start after updating. ${detail}`, {
					cause: new AggregateError([startupError, error], 'PHP startup and recovery failed.')
				});
			}
		}

		readyBus = ready.bus;
		readyController = ready.controller;
		return readyBus;
	})().finally(() => {
		pending = null;
	});

	return pending;
};
