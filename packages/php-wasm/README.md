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
