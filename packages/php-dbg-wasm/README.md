# [![seanmorris/php-dbg-wasm](https://github.com/seanmorris/php-wasm/blob/master/docs/sean-icon.png)](https://github.com/seanmorris/php-wasm) php-dbg-wasm

Find `php-dbg-wasm` on [npm](https://npmjs.com/package/php-dbg-wasm)

Run the `phpdbg` runtime in Node.js or ESM-capable browser contexts.

## Install

```bash
npm install php-dbg-wasm
```

## Quickstart

```javascript
import { PhpDbgNode } from 'php-dbg-wasm/PhpDbgNode';

const php = new PhpDbgNode();

await php.run();
await php.provideInput('help');
```

On current Node releases, the core `PhpDbgNode` entrypoint can be consumed from either ESM or CommonJS:

```javascript
const { PhpDbgNode } = require('php-dbg-wasm/PhpDbgNode');

const php = new PhpDbgNode();

await php.run();
await php.provideInput('help');
```

Runtime-loadable extension helper JS packages remain ESM-only; provide extension assets manually through the runtime constructor options when you need to bypass the helper packages.

For broader project documentation, see:

https://github.com/seanmorris/php-wasm
