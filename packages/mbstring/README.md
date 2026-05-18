# php-wasm-mbstring

`php-wasm-mbstring` provides the `mbstring` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-mbstring
```

## What It Loads

The package resolves the active runtime version to `php8.x-mbstring.so` and bundles `libonig.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import mbstring from 'php-wasm-mbstring';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [mbstring],
});

await php.run(`<?php var_dump(extension_loaded('mbstring'));`);
```

## Custom Builds

Enable `WITH_MBSTRING` in `.php-wasm-rc`.

## Build Options

- `WITH_MBSTRING`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_ONIGURUMA`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
- `WITH_ONIGURUMA` controls whether `libonig.so` is built and emitted alongside the extension.
