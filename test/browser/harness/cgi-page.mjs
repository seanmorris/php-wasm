import {
	appendStderr,
	buildType,
	runtimeVersion,
	setMeta,
	setStatus,
} from './common.mjs';

const testPath = '/php-wasm/cgi-bin/test';

const waitForControl = async () => {
	if(navigator.serviceWorker.controller)
	{
		return navigator.serviceWorker.controller;
	}

	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Timed out waiting for service-worker control.')), 30000);

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			clearTimeout(timeout);
			resolve();
		}, {once: true});
	});

	return navigator.serviceWorker.controller;
};

const main = async () => {
	if(!navigator.serviceWorker)
	{
		throw new Error('Service workers are not available in this browser.');
	}

	setStatus('registering');

	const workerUrl = new URL(`../cgi-worker.mjs?version=${encodeURIComponent(runtimeVersion)}&buildType=${encodeURIComponent(buildType)}&cacheBust=${Date.now()}`, import.meta.url);
	const registration = await navigator.serviceWorker.register(workerUrl, {
		scope: '/php-wasm/'
		, type: 'module'
		, updateViaCache: 'none'
	});

	setMeta(
		'worker-url',
		registration.active?.scriptURL
			?? registration.installing?.scriptURL
			?? registration.waiting?.scriptURL
			?? ''
	);

	await navigator.serviceWorker.ready;

	const controller = await waitForControl();

	if(!controller)
	{
		throw new Error('No active service worker controller was found.');
	}

	setMeta('controller', controller.scriptURL);

	const response = await fetch(testPath);
	const responseText = await response.text();

	setMeta('powered-by', response.headers.get('x-powered-by') ?? '');
	setMeta('status-code', response.status);
	setMeta('request-path', testPath);
	document.querySelector('[data-testid="response-text"]').textContent = responseText;
	setStatus(response.ok ? 'done' : 'failed');

	if(!response.ok)
	{
		appendStderr([responseText, responseText.endsWith('\n') ? '' : '\n']);
		throw new Error(`CGI response failed with status ${response.status}.`);
	}
};

main().catch(error => {
	appendStderr([`${String(error)}\n`]);
	setStatus('failed');
	throw error;
});
