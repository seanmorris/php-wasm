# pdo-pglite

`pdo-pglite` is the PostgreSQL-compatible PDO driver extension used by `php-wasm` via `@electric-sql/pglite`.

This package mainly exists so custom `php-wasm` builds can compile in the `pdo_pglite` extension.
It does not expose a separate JavaScript entrypoint from this folder. At runtime, support is activated by passing a `PGlite` constructor into the `php-wasm` runtime.

## Requirements

`pdo_pglite` requires PHP 8.1 or newer.

## Install

```sh
npm install php-wasm pdo-pglite @electric-sql/pglite
```

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import { PGlite } from '@electric-sql/pglite';

const php = new PhpWeb({
  version: '8.4',
  PGlite,
});

await php.run(`<?php
  $pdo = new PDO('pgsql:idb-storage');
  var_dump($pdo instanceof PDO);
`);
```

## Custom Builds

Enable `WITH_PDO_PGLITE=1` in `.php-wasm-rc`.

## Build Options

- `WITH_PDO_PGLITE`: defaults to `1`. Set it to `0` if you want to exclude the extension from a custom build.
- `PDO_PGLITE_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `pdo-pglite` repository during the build.
