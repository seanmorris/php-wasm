# php-wasm-sqlite

`php-wasm-sqlite` provides the `sqlite3` and `pdo_sqlite` extensions for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-sqlite
```

## What It Loads

The package resolves the active runtime version to `php8.x-sqlite.so` and `php8.x-pdo-sqlite.so`, and bundles `libsqlite3.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import sqlite from 'php-wasm-sqlite';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [sqlite],
});

await php.run(`<?php
  var_dump(
    extension_loaded('sqlite3'),
    extension_loaded('pdo_sqlite')
  );
`);
```

## Custom Builds

Enable `WITH_SQLITE` in `.php-wasm-rc`.

## Build Options

- `WITH_SQLITE`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
- This flag controls the `sqlite3` extension, `pdo_sqlite`, and the companion `libsqlite3.so` side library.
