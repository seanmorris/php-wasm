# php-wasm-iconv

`php-wasm-iconv` provides the `iconv` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-iconv
```

## What It Loads

The package resolves the active runtime version to `php8.x-iconv.so` and bundles `libiconv.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import iconv from 'php-wasm-iconv';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [iconv],
});

await php.run(`<?php var_dump(extension_loaded('iconv'));`);
```

## Custom Builds

Enable `WITH_ICONV` in `.php-wasm-rc`.

## Build Options

- `WITH_ICONV`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
