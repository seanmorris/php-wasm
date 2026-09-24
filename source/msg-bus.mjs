const incomplete = new Map();

/**
 * Waits for a selected worker to activate, including an installation already in progress.
 * @param {ServiceWorker} worker Worker selected from a registration or supplied directly.
 * @returns {Promise<ServiceWorker>} Activated worker, or a rejection if installation fails.
 */
const waitForActivation = worker => new Promise((accept, reject) => {
	const checkState = () => {
		if(worker.state !== 'activated' && worker.state !== 'redundant') return;
		worker.removeEventListener('statechange', checkState);
		if(worker.state === 'activated') accept(worker);
		else reject(new Error('Service worker became redundant before activation.'));
	};
	worker.addEventListener('statechange', checkState);
	checkState();
});

/**
 * Create a sendMessage function that waits for the target service worker to activate.
 * Registration, installation, and message-cloning failures reject the returned promise.
 * @param {ServiceWorker|string} serviceWorker The service worker instance or registration URL to target.
 * @returns {(action: string, params?: PhpMessageParams) => Promise<PhpRuntimeValue>} Function that sends an RPC-style message to the service worker.
 */
export const sendMessageFor = (serviceWorker) => async (action, params = []) => {
	let worker = serviceWorker;
	if(!(worker instanceof ServiceWorker))
	{
		const registration = await navigator.serviceWorker.getRegistration(worker);
		if(!registration) throw new Error(`No service worker registration found for ${serviceWorker}.`);
		worker = [registration.active, registration.waiting, registration.installing]
		.find(candidate => candidate && candidate.state !== 'redundant');
		if(!worker) throw new Error('Service worker registration has no available worker.');
	}

	await waitForActivation(worker);
	const token = window.crypto.randomUUID();
	return new Promise((accept, reject) => {
		incomplete.set(token, [accept, reject, action, params]);
		try
		{
			worker.postMessage({action, params, token});
		}
		catch(error)
		{
			incomplete.delete(token);
			reject(error);
		}
	});
};

/**
 * Resolves pending service worker RPC calls when replies arrive.
 * Event handler for recieved messages.
 * @param {MessageEvent} event Message event carrying an RPC reply from the service worker.
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
