# php-wasm-openssl

`php-wasm-openssl` provides the `openssl` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-openssl
```

## What It Loads

The package resolves the active runtime version to `php8.x-openssl.so` and bundles `libssl.so` plus `libcrypto.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import openssl from 'php-wasm-openssl';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [openssl],
});

await php.run(`<?php var_dump(extension_loaded('openssl'));`);
```

## Custom Builds

Enable `WITH_OPENSSL` in `.php-wasm-rc`.

## Build Options

- `WITH_OPENSSL`: defaults to `dynamic`. Allowed values: `0`, `1`, `shared`, `dynamic`.
- OpenSSL does not use a `static` mode in this package makefile. Shared and dynamic builds emit `libssl.so` and `libcrypto.so`.
