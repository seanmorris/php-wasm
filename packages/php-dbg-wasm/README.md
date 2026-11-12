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
do not enable cooperative yielding unless they request it. Set
`dbgManagedShutdown:true` for embedded single-run sessions to execute registered
shutdown functions, object destructors, and output handlers during request cleanup.
This is opt-in because standalone phpdbg normally discards those callbacks when
resetting a debugging session.

Pass `dbgArgs` to add phpdbg command-line arguments: `dbgArgs: ['-q']` starts
without the welcome banner. Command notices are unaffected.

`dumpBacktrace()` numbers frames from the innermost one, whichever frame
`switchFrame()` selected, and marks the selected frame with `selected: true`.

`await php.debuggerApiVersion()` reports what the runtime's Vrzno can inspect.
With version 2:

- Each frame also has `functionName` and `className` (empty for top-level code
  and outside a class), and a frame's `frame` is always the index
  `switchFrame()` takes, including when an internal function is on the stack.
- `dumpGlobals({user: true})` lists user-defined globals with the superglobals,
  from any frame. Without the option it lists superglobals only, as before.
- `describeVars()`, `describeGlobals({user})` and `describeConstants()` return
  `{name, type, className, count, reference, value}` for each symbol. `type` is
  a PHP type name, or `undefined` for a variable that has not been assigned
  yet; `count` is the number of elements in an array or of bytes in a string.
  `describeValue(value)` does the same for a value taken from a dump, such as
  an array element. A scalar reached that way carries no PHP type, so an
  integral float reads as `int`.

With version 1 those four methods and `dumpGlobals({user: true})` throw.

`dl()` is registered in the debugger runtime, as it is under the CLI.

For a controller, styleable GUI, editor adapters, variable editing, structured
results, and shared downloads, use
[php-dbg-component](https://github.com/seanmorris/php-dbg-component).
