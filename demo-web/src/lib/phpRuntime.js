/**
 * Bounded, read-only startup for pages using the shared CGI runtime.
 */
import { getPhpBus, waitForPhpBusRequest } from './phpBus';
import { recoverServiceWorker } from './serviceWorker';

export const runtimeReadyTimeoutMs = 15000;
export const runtimeStartupRetryDelaysMs = [1000, 2000];

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
 * Registration, replacement and readiness failures get two delayed retries.
 * Only startup is retried; callers retain responsibility for their mutations.
 * @param {{onProgress?: (message: string) => void}} options Startup status callback.
 * @returns {Promise<object>} The ready CGI control bus.
 */
export const getReadyPhpBus = async ({onProgress = () => {}} = {}) => {
	if(!navigator.serviceWorker)
	{
		throw new Error('This browser does not support service workers for PHP startup.');
	}

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
		let startupController = controller;
		const errors = [];

		for(let attempt = 0; attempt <= runtimeStartupRetryDelaysMs.length; attempt++)
		{
			try
			{
				if(attempt)
				{
					const delay = runtimeStartupRetryDelaysMs[attempt - 1];
					const retry = `${attempt} of ${runtimeStartupRetryDelaysMs.length}`;

					onProgress(`Retrying PHP startup in ${delay / 1000}s (${retry})...`);
					await new Promise(resolve => setTimeout(resolve, delay));
					onProgress(`Updating PHP runtime (${retry})...`);
					await recoverServiceWorker(startupController);
					onProgress(`Restarting PHP runtime (${retry})...`);
				}

				const bus = await getPhpBus();

				startupController = navigator.serviceWorker?.controller;
				const ready = await probeRuntime(bus);

				readyBus = ready.bus;
				readyController = ready.controller;
				return readyBus;
			}
			catch(error)
			{
				errors.push(error);
			}
		}

		const error = errors.at(-1);
		const detail = error?.error ?? error?.message ?? String(error);

		throw new Error(`PHP could not start after ${errors.length} attempts. ${detail}`, {
			cause: new AggregateError(errors, 'PHP startup and recovery failed.')
		});
	})().finally(() => {
		pending = null;
	});

	return pending;
};
