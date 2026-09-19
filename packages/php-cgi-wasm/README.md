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

## Directory listings and persistence

`await php.readdir(path)` still returns `string[]`. For directory names and types
in one operation, use `await php.readdir(path, {withFileTypes: true})`. Each entry
is a serializable `{name: string, isFolder: boolean}` object. Both forms preserve
filesystem order and include `.` and `..`. Types follow symbolic links, as
`analyzePath` does; listing and metadata errors reject the operation.

With automatic browser transactions enabled, `analyzePath`, `readdir`, `readFile`,
and `stat` refresh persisted storage before reading but do not flush it afterward.
A typed listing resolves every entry's type inside that single transaction.
Writes still resolve only after persistence finishes. With `autoTransaction: false`,
the caller retains ownership of transaction boundaries.

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
