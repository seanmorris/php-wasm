import { basePath, baseUrlFor } from './runtimePaths';

export const ensureServiceWorker = async () => {
	if(!('serviceWorker' in navigator))
	{
		return false;
	}

	await navigator.serviceWorker.register(basePath('cgi-worker.js'), {
		type: 'module'
		, scope: basePath()
	});
	await navigator.serviceWorker.getRegistration(baseUrlFor().toString());
	await navigator.serviceWorker.ready;

	await new Promise(resolve => {
		if(navigator.serviceWorker.controller)
		{
			return resolve();
		}

		navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
			once: true
		});
	});

	return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
};
