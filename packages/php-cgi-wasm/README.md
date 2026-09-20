# [![seanmorris/php-cgi-wasm](https://github.com/seanmorris/php-wasm/blob/master/docs/sean-icon.png)](https://github.com/seanmorris/php-wasm) php-cgi-wasm

find php-cgi-wasm on [npm](https://npmjs.com/package/php-cgi-wasm)

_The CGI Counterpart to [php-wasm](https://npmjs.com/package/php-wasm)._

This package encompasses the CGI-specific build artifacts of php-wasm. The goal of this part of the project is to provide a version of PHP that more closely resembles the environment facilitated by PHP when running under web servers like Apache and nginx. This is achieved by building a binary artifact of PHP-CGI, rather than PHP-CLI to Web Assembly. The resulting WASM binary can then be run under Node.js with Express or inside a service worker.

## Example Service Worker

```javascript
import { PhpCgiWorker } from "php-cgi-wasm/PhpCgiWorker";

// Spawn the PHP-CGI binary
const php = new PhpCgiWorker({
	prefix: '/php-wasm'
	, docroot: '/persist/www'
	, types: {
		jpeg: 'image/jpeg'
		, jpg: 'image/jpeg'
		, gif: 'image/gif'
		, png: 'image/png'
		, svg: 'image/svg+xml'
	}
});

// Set up the event handlers
self.addEventListener('install',  event => php.handleInstallEvent(event));
self.addEventListener('activate', event => php.handleActivateEvent(event));
self.addEventListener('fetch',    event => php.handleFetchEvent(event));
self.addEventListener('message',  event => php.handleMessageEvent(event));
```

On current Node releases, the core `PhpCgiNode` entrypoint can be consumed from either ESM or CommonJS:

```javascript
const { PhpCgiNode } = require('php-cgi-wasm/PhpCgiNode');

const php = new PhpCgiNode({
	prefix: '/php-wasm/cgi-bin/',
	docroot: '/persist/www',
});
```

Runtime-loadable extension helper JS packages remain ESM-only; pass extension assets manually when you need to manage them directly.

## First messages to a service worker

Register the worker and attach `onMessage` from `php-cgi-wasm/msg-bus.mjs` to
`navigator.serviceWorker` before calling the function returned by
`sendMessageFor(workerUrl)`. The helper waits through installation and activation,
so a first request can be made immediately after registration resolves.
Missing registrations, failed installations, and message-cloning failures
reject the call. Runtime failures such as denied persistent storage also reject;
private-mode storage support depends on the browser.

## Directory listings and persistence

`await php.readdir(path)` still returns `string[]`. For directory names and types
in one operation, use `await php.readdir(path, {withFileTypes: true})`. Each entry
is a serializable `{name: string, isFolder: boolean}` object. Both forms preserve
filesystem order and include `.` and `..`. Types follow symbolic links, as
`analyzePath` does; listing and metadata errors reject the operation.

With automatic browser transactions enabled, queued filesystem calls share a
batch, waiting up to 25 ms after the queue becomes idle for more work. Storage
is refreshed once. A batch containing only `analyzePath`, `readdir`, `readFile`,
or `stat` does not flush; any mutation makes the batch writable. Every call
waits for the shared commit, and a commit failure rejects the whole batch.
`Promise.all` calls can share this work; sequentially awaited calls cannot.
Batches are bounded to 64 operations or a 250 ms processing window, checked
between operations. With `autoTransaction: false`, the caller owns transaction
boundaries and operations are not delayed for automatic batching.

Browser CGI requests, filesystem RPCs, and runtime refreshes share one lock.
PHP keeps that lock while suspended on asynchronous work and until its writes
are persisted. HTTP CGI requests still flush after each successful PHP request;
the 25 ms batching window applies to filesystem RPCs. Await writes before
opening a URL that uses them. Persistence failures return a non-cacheable
HTTP 500; `onRequest` receives the final response
after the commit attempt, and later queued work can still run. Without Web Locks,
serialization is limited to the current JavaScript realm.

Browser CGI journals PHP and filesystem API mutations, committing only changed
IDBFS records. This includes metadata, renamed trees and deletions. Clean mounts
need no write transaction. Existing IDBFS storage remains compatible; hydration
still reconciles remote changes, with a cheaper local-node traversal. Nested
mounts use ordinary reconciliation. Failed commits retain pending changes and
retry them before the next hydration. Symlink hydration restores the link's
metadata without following or changing its target.

## Persisted cookies

The internal `/config/.cookies` snapshot stores absolute expiry deadlines, so
restarting or refreshing a worker does not renew `Max-Age` cookies. Cookie
deletion and replacement are persisted with the next successful request.

Legacy snapshots retain session cookies and unexpired `Expires` cookies.
Legacy `Max-Age` cookies are discarded because their original expiry cannot be
recovered; users with those cookies may need to sign in again. Fresh cookie
headers supplied through the constructor still start their lifetime when received.
Treat the snapshot format as internal rather than editing its JSON directly.

## Phar applications

For a dynamic build, enable Phar and, for gzip support, zlib:

```javascript
import { PhpCgiWorker } from 'php-cgi-wasm/PhpCgiWorker.mjs';
import phar from 'php-wasm-phar';
import zlib from 'php-wasm-zlib';

const php = new PhpCgiWorker({
	prefix: '/php-wasm/'
	, docroot: '/persist/www'
	, sharedLibs: [zlib, phar]
	, entrypoint: 'app.phar'
});
```

Place the archive at `/persist/www/app.phar` and use a `Phar::webPhar()` stub in it.
Requests to `/php-wasm/app.phar/index.php` execute the archive with
`SCRIPT_NAME=/php-wasm/app.phar` and `PATH_INFO=/index.php`. PHP handles the archive's
scripts, assets and missing members. Direct archive requests redirect within the
URL prefix rather than including the filesystem docroot.

The optional `entrypoint` also routes fallback requests such as
`/php-wasm/hello.txt` into the archive. Existing physical files and directory
`index.php` files take precedence. A virtual host's `entrypoint` overrides the
runtime default. Object rewrites retain their explicit `scriptName`.

Archives remain read-only by default. Static builds with Phar and zlib compiled
in do not need the `sharedLibs` entries above.
