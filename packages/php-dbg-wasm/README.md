# [![seanmorris/php-dbg-wasm](https://seanmorris.github.io/php-wasm/sean-icon.png)](https://github.com/seanmorris/php-wasm) php-dbg-wasm

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

Filesystem helpers include `await php.readdir(path)` for names and
`await php.readdir(path, {withFileTypes: true})` for serializable `{name, isFolder}`
entries. Both forms include `.` and `..`; types follow symbolic links and metadata
errors reject the call. See [filesystem operations](https://php-wasm.seanmorr.is/filesystem/fs-operations.html).

For broader project documentation, see:

https://github.com/seanmorris/php-wasm

## Browser workers and embeddable debugger UI

`PhpDbgWorker` exposes the same low-level debugger API as `PhpDbgWeb`, using a
native `ENVIRONMENT=worker` artifact. Import it inside a module worker:

```js
import {PhpDbgWorker} from 'php-dbg-wasm/PhpDbgWorker';
const php = new PhpDbgWorker({version:'8.4', persist:false});
```

`make worker-dbg-mjs` and `make worker-dbg-js` build the worker variants. `dbg-all`,
`dbg-mjs`, and `dbg-cjs` include them. Web and worker builds emit an
`.assets.json` manifest beside each loader with its exact WASM filename, SHA-256,
required shared libraries, and bridge version. Deploy it with the loader and
binary. `run()` is the debugger **process loop**; it resolves when phpdbg quits,
not at an individual script's breakpoint or completion.

The optional native browser bridge separates program output from debugger output
through `onDbgOutput({type,fd,bytes,evaluating})`, reports exception metadata through
`onDbgEvent`, and allows cooperative pause/stop with `dbgYieldInterval`,
`dbgPauseRequested`, and `dbgStopRequested`. Bridge version 1 is exposed as
`php_wasm_dbg_bridge_version`. Existing callers retain their console output and
do not enable cooperative yielding unless they request it.

For a controller, styleable GUI, editor adapters, variable editing, structured
results, and shared downloads, use
[php-dbg-component](https://github.com/seanmorris/php-dbg-component).
