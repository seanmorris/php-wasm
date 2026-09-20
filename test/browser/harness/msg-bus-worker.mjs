const token = new URL(self.location.href).searchParams.get('token');

self.addEventListener('install', event => event.waitUntil(
	fetch(`/php-wasm/install-gate?token=${token}`)
	.then(response => response.text())
	.then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
	event.source.postMessage({re: event.data.token, result: event.data.params});
});
