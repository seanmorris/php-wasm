---
title: PHP-CGI in Service Workers
weight: -600
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/getting-started/cgi-service-worker.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/packages/php-cgi-wasm/PhpCgiWorker.mjs
-->
# Php-Cgi-Wasm for Service Workers

Version 0.0.9 adds `php-cgi-wasm` to the mix. This allows you to run php in web-server mode, similar to how it runs under apache or nginx. Running within a Service Worker, it can intercept and respond to HTTP requests just like a normal webserver. This means the browser can simply navigate to a URL, and PHP will generate the page, and everything will work as-normal, AJAX and all. From the perspective of the webpage, its just making HTTP requests. Its not worried about whether the PHP runs on the server or in a Service Worker.

### Install the php-cgi-wasm package

```bash
$ npm install php-cgi-wasm
```

### Example Service Worker

```  { .javascript numbers="true" }
import { PhpCgiWorker } from "php-cgi-wasm/PhpCgiWorker";

// Spawn the PHP-CGI binary
const php = new PhpCgiWorker({
	prefix:  '/php-wasm',
	docroot: '/persist/www',
	types: {
		jpg:  'image/jpeg',
		jpeg: 'image/jpeg',
		gif:  'image/gif',
		png:  'image/png',
		svg:  'image/svg+xml',
	}
});

// Set up the event handlers
self.addEventListener('install',  event => php.handleInstallEvent(event));
self.addEventListener('activate', event => php.handleActivateEvent(event));
self.addEventListener('fetch',    event => php.handleFetchEvent(event));
self.addEventListener('message',  event => php.handleMessageEvent(event));
```

***Note:*** `php-cgi-wasm` & `php-wasm` are separate packages. One "embeds" php right into your javascript, the other runs in "cgi-mode," just like php would under apache or nginx.

### msg-bus

There is a `msg-bus` module supplied by `php-cgi-wasm` as a helper to communicate with php running inside a worker. The module exposes two functions: `sendMessageFor` and `onMessage`.

This allows you to simply `await` the result of calls to file system methods (see above) on the service worker:

```javascript
const result = await sendMessage(methodName, [param, param, param]);
```

#### onMessage & sendMessageFor

* Use `onMessage` as an event handler for `message` events coming from the Service Worker.
* Use `sendMessageFor` to **GENERATE A FUNCTION** that you can use to send messages to your service worker.

```{ .javascript highlight="9,11" }
import { onMessage, sendMessageFor } from 'php-cgi-wasm/msg-bus';

const SERVICE_WORKER_SCRIPT_URL = '/cgi-worker.mjs';

navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL);

navigator.serviceWorker.addEventListener('message', onMessage);

const sendMessage = sendMessageFor(SERVICE_WORKER_SCRIPT_URL);

const result = await sendMessage(methodName, [param, param, param]);
```

#### php.handleMessageEvent

Once you've got the above set up, use `php.handleMessageEvent` to handle the `message` events on the service worker:

```javascript
self.addEventListener('message',  event => php.handleMessageEvent(event));
```
