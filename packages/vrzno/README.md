# vrzno

`vrzno` is the PHP-to-JavaScript bridge extension used by `php-wasm`.

It lets PHP code interact with JavaScript objects, classes, promises, callbacks, and values on `globalThis`.
The standard `php-wasm` runtime already includes Vrzno by default, so most consumers do not need to import anything from this package directly. This folder mainly exists for custom-build plumbing.

## Usage

```js
import { PhpNode } from 'php-wasm/PhpNode.mjs';

const php = new PhpNode({
  version: '8.4',
  answer: 42,
});

await php.run(`<?php
  $global = new Vrzno;

  var_dump(vrzno_env('answer'));
  var_dump($global->Date->now() > 0);
`);
```

## Useful PHP APIs

Use `new Vrzno` to get a handle to `globalThis`.
Use `vrzno_env()` to read values passed into the runtime constructor.
Use `vrzno_await()` to wait on promise-like values from PHP.
Use `vrzno_import()` to dynamically import JavaScript modules from PHP.

## Custom Builds

Enable `WITH_VRZNO=1` in `.php-wasm-rc`.
That is the default for the main `php-wasm` runtime.

## Build Options

- `WITH_VRZNO`: defaults to `1`. Set it to `0` to remove the extension from a custom build.
- `VRZNO_REPOSITORY`: optional Git repository override. Defaults to the upstream Vrzno repository.
- `VRZNO_REF`: exact Git commit to build. The default pins the Vrzno 0.2.0 integration revision.
- `VRZNO_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `vrzno` repository during the build.

Local source imports refresh every extension translation unit, so changes to shared headers cannot leave stale object files in incremental builds.
