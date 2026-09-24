# [![seanmorris/php-wasm](https://github.com/seanmorris/php-wasm/blob/master/docs/sean-icon.png)](https://github.com/seanmorris/php-wasm) php-wasm

Find `php-wasm` on [npm](https://npmjs.com/package/php-wasm)

Run PHP directly in the browser, in a worker, or in Node.js.

## Install

```bash
npm install php-wasm
```

## Quickstart

```javascript
import { PhpWeb } from 'php-wasm/PhpWeb';

const php = new PhpWeb();

await php.run('<?php echo "Hello, world!";');
```

`PhpWeb` is published as an ESM browser/runtime entrypoint.

On current Node releases, the core `PhpNode` entrypoint can be consumed from either ESM or CommonJS:

```javascript
const { PhpNode } = require('php-wasm/PhpNode');

const php = new PhpNode();
```

Runtime-loadable extension helper JS packages are ESM-only. When you need to manage extension assets manually, pass `.so`, `.data`, `.wasm`, and support-library assets with `sharedLibs`, `dynamicLibs`, `files`, and `locateFile`.

## PHP script tags

Load `php-tags.mjs` as a module to execute `<script type="text/php">` elements.
The loader waits for the initial document to finish parsing, so `async` loading
from `<head>` works even when local assets arrive before the body. PHP tags added
afterward are observed too.

For local hosting, use the package's public HTTP URL and retain its relative
module paths and matching JavaScript/Wasm assets. A path like
`node_modules/php-wasm/php-tags.mjs` is relative to the page's directory;
`/node_modules/php-wasm/php-tags.mjs` starts at the server root, when that directory
is exposed there.

## SDL browser runtime

Install the standalone `php-sdl-wasm` package for SDL graphics, input and audio:

```js
import { PhpSdl } from 'php-sdl-wasm/php8.4-sdl.mjs';

const php = new PhpSdl({canvas: document.querySelector('canvas')});
```

Each versioned entry carries its matching runtime and native dependencies.
`php-wasm` does not depend on or load this package. Replace previous
`new PhpWeb({version: '8.4', variant: '_sdl', ...options})` calls with
`new PhpSdl(options)`. See the [SDL guide](https://github.com/seanmorris/php-wasm/tree/develop/packages/php-sdl-wasm).

## Directory listings

`await php.readdir(path)` returns names as `string[]`. Pass
`{withFileTypes: true}` to return serializable `{name: string, isFolder: boolean}`
entries instead, without a separate `analyzePath` call for each name:

```javascript
const entries = await php.readdir('/persist', {withFileTypes: true});
```

Both forms preserve filesystem order and include `.` and `..`. Classification
follows symbolic links, as `analyzePath` does. Listing or metadata errors reject
the operation, including dangling links. This option is also available in the
CLI, CGI, debugger, and Cloudflare runtimes.

For full documentation, examples, and release notes, see the repository README:

https://github.com/seanmorris/php-wasm
