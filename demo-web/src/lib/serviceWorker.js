/**
 * Service worker registration helpers for the CGI-backed demo runtime.
 */
import { basePath, baseUrlFor } from './runtimePaths';

export const serviceWorkerControlTimeoutMs = 1500;

/**
 * Registers the CGI worker and waits briefly for page control when necessary.
 */
export const ensureServiceWorker = async ({timeoutMs = serviceWorkerControlTimeoutMs} = {}) => {
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
		};
	}

	try
	{
		const registration = await navigator.serviceWorker.register(basePath('cgi-worker.js'), {
			type: 'module'
			, scope: basePath()
		});
		await navigator.serviceWorker.getRegistration(baseUrlFor().toString());
		await navigator.serviceWorker.ready;

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
			, registration: null
		};
	}
};
