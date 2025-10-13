const incomplete = new Map();

/**
 * Create a sendMessage function given a service worker URL.
 * @param {*} serviceWorker The ServieWorker object or URL to the service worker.
 * @returns sendMessage function for the service workrer.
 */
export const sendMessageFor = (serviceWorker) => async (action, params = []) => {
	const token = window.crypto.randomUUID();
	let accept, reject;
	const ret = new Promise((_accept, _reject) => [accept, reject] = [_accept, _reject]);
	incomplete.set(token, [accept, reject, action, params]);

	if(serviceWorker instanceof ServiceWorker)
	{
		serviceWorker.postMessage({action, params, token});
	}
	else
	{
		navigator.serviceWorker
		.getRegistration(serviceWorker)
		.then(registration => {
			if(registration.active)
			{
				registration.active.postMessage({action, params, token});
			}
			else
			{
				console.log(registration);
				registration.addEventListener('updatefound', () => {
					const worker = registration.installing;
					if(worker)
					{
						worker.addEventListener('statechange', () => {
							if(worker.state === 'activated')
							{
								worker.postMessage({action, params, token});
							}
						}, {once: true});
					}
				}, {once: true});
			}
		});
	}


	return ret;
};

/**
 * Event handler for recieved messages.
 * @param {*} event
 */
export const onMessage = event => {
	if(event.data.re && incomplete.has(event.data.re))
	{
		const [accept, reject, action, params] = incomplete.get(event.data.re);

		incomplete.delete(event.data.re);

		if(!event.data.error)
		{
			accept(event.data.result);
		}
		else
		{
			reject({error: event.data.error, action, params});
		}
	}
};
