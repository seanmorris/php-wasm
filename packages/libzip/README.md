# php-wasm-libzip

`php-wasm-libzip` provides the `zip` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libzip
```

## What It Loads

The package resolves the active runtime version to `php8.x-zip.so` and bundles `libzip.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import zip from 'php-wasm-libzip';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [zip],
});

await php.run(`<?php var_dump(extension_loaded('zip'));`);
```

## Custom Builds

Enable `WITH_LIBZIP` in `.php-wasm-rc`.

## Build Options

- `WITH_LIBZIP`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
