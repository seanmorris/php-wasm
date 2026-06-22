# php-wasm-zlib

`php-wasm-zlib` provides the `zlib` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-zlib
```

## What It Loads

The package resolves the active runtime version to `php8.x-zlib.so` and bundles `libz.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import zlib from 'php-wasm-zlib';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [zlib],
});

await php.run(`<?php var_dump(extension_loaded('zlib'));`);
```

## Custom Builds

Enable `WITH_ZLIB` in `.php-wasm-rc`.

## Build Options

- `WITH_ZLIB`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
