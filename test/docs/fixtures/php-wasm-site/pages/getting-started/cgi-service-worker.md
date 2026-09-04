---
title: PHP-CGI in Service Workers
weight: -600
---
<!--
Vendored from php-wasm-site commit 3ba91aac4946c53c89d0fdfa6ea10eadd8d27684
Source: https://github.com/seanmorris/php-wasm-site/blob/3ba91aac4946c53c89d0fdfa6ea10eadd8d27684/pages/getting-started/cgi-service-worker.md
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

### quickbus

Install `quickbus` separately if you want to call `php-cgi-wasm` methods from the page:

```bash
$ npm install quickbus@^1.0.2
```

`php.handleMessageEvent` already speaks the same request/reply protocol, so you can `await` service worker filesystem calls through a `quickbus` client:

```javascript
const result = await bus.analyzePath('/path/to/your/file');
```

#### Client.forServiceWorker & Client.forServiceWorkerRegistration

* Use `Client.forServiceWorker(navigator.serviceWorker)` once the page is already controlled by the worker.
* Use `Client.forServiceWorkerRegistration(registration)` on first load, after `await navigator.serviceWorker.ready`.

```javascript
import { Client } from 'quickbus';

const SERVICE_WORKER_SCRIPT_URL = '/cgi-worker.mjs';

await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, {type: 'module'});
const registration = await navigator.serviceWorker.ready;

const bus = navigator.serviceWorker.controller
	? Client.forServiceWorker(navigator.serviceWorker)
	: Client.forServiceWorkerRegistration(registration);

const result = await bus.analyzePath('/path/to/your/file');
```

#### php.handleMessageEvent

Once you've got the above set up, use `php.handleMessageEvent` to handle the `message` events on the service worker:

```javascript
self.addEventListener('message',  event => php.handleMessageEvent(event));
```
