# php-wasm-tidy

`php-wasm-tidy` provides the `tidy` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-tidy
```

## What It Loads

The package resolves the active runtime version to `php8.x-tidy.so` and bundles `libtidy.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import tidy from 'php-wasm-tidy';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [tidy],
});

await php.run(`<?php var_dump(extension_loaded('tidy'));`);
```

## Custom Builds

Enable `WITH_TIDY` in `.php-wasm-rc`.

## Build Options

- `WITH_TIDY`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
- `WITH_TIDY=static` requires `WITH_LIBXML=static`.
- `WITH_TIDY=shared` expects `WITH_LIBXML` to be `shared` or `static`. `WITH_TIDY=dynamic` expects a dynamic libxml setup.
