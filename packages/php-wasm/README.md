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

For full documentation, examples, and release notes, see the repository README:

https://github.com/seanmorris/php-wasm
