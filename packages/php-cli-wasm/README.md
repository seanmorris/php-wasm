# [![seanmorris/php-cli-wasm](https://github.com/seanmorris/php-wasm/blob/master/docs/sean-icon.png)](https://github.com/seanmorris/php-wasm) php-cli-wasm

Find `php-cli-wasm` on [npm](https://npmjs.com/package/php-cli-wasm)

Run the PHP CLI runtime in Node.js or ESM-capable browser contexts.

## Install

```bash
npm install php-cli-wasm
```

## Quickstart

```javascript
import { PhpCliNode } from 'php-cli-wasm/PhpCliNode';

const php = new PhpCliNode({code: 'echo "Hello, world!\\n";'});

await php.run();
```

On current Node releases, the core `PhpCliNode` entrypoint can be consumed from either ESM or CommonJS:

```javascript
const { PhpCliNode } = require('php-cli-wasm/PhpCliNode');

const php = new PhpCliNode({code: 'echo "Hello, world!\\n";'});

await php.run();
```

Runtime-loadable extension helper JS packages remain ESM-only; provide extension assets manually through the runtime constructor options when you need to bypass the helper packages.

For broader project documentation, see:

https://github.com/seanmorris/php-wasm
