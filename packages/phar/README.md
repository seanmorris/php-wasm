# php-wasm-phar

`php-wasm-phar` provides the `phar` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-phar
```

## What It Loads

The package resolves the active runtime version to `php8.x-phar.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import phar from 'php-wasm-phar';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [phar],
});

await php.run(`<?php var_dump(extension_loaded('phar'));`);
```

## Custom Builds

Enable `WITH_PHAR` in `.php-wasm-rc`.

## Build Options

- `WITH_PHAR`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
