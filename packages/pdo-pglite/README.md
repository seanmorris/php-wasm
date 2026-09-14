# pdo-pglite

`pdo-pglite` is the PostgreSQL-compatible PDO driver extension used by `php-wasm` via `@electric-sql/pglite`.

This package mainly exists so custom `php-wasm` builds can compile in the `pdo_pglite` extension.
It does not expose a separate JavaScript entrypoint from this folder. At runtime, support is activated by passing a `PGlite` constructor into the `php-wasm` runtime.

## Requirements

`pdo_pglite` requires PHP 8.1 or newer.
Custom builds must also keep the Vrzno extension enabled (`WITH_VRZNO=1`).

## Install

```sh
npm install php-wasm pdo-pglite @electric-sql/pglite@^0.5.8
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
  $pdo = new PDO('pgsql:idb://pdo-pglite-pg18');
  var_dump($pdo instanceof PDO);
`);
```

## Upgrading Persisted Databases

PGlite 0.5 uses PostgreSQL 18. A database directory created by PGlite 0.2
(PostgreSQL 16) cannot be opened in place. Export it logically with the old
PGlite version, restore it into a new database name such as
`idb://pdo-pglite-pg18`, and switch the PDO DSN only after the restore.
Do not copy a `dumpDataDir()` archive between these PostgreSQL versions.

See the [PGlite upgrade guide](https://pglite.dev/docs/upgrade) and
[PGlite tools documentation](https://pglite.dev/docs/pglite-tools).

## Custom Builds

Enable `WITH_PDO_PGLITE=1` in `.php-wasm-rc`.

## Build Options

- `WITH_PDO_PGLITE`: defaults to `1`. Set it to `0` if you want to exclude the extension from a custom build.
- `PDO_PGLITE_REPOSITORY`: optional Git repository override. Defaults to the upstream `pdo-pglite` repository.
- `PDO_PGLITE_REF`: Git revision to build. The default is an immutable commit pin.
- `PDO_PGLITE_DEV_PATH`: optional local source checkout to use instead of the pinned repository during the build.

Imports verify the active repository/ref or development path and the hash of each input on every build. Switching A to B and back to A, editing included C files or headers, or adding/removing inputs refreshes the extension and its configuration. Unchanged imports preserve timestamps and do not trigger recompilation. Base, CGI, CLI, and debugger builds all depend on the generated extension manifest.

Managed inputs are root-level C and header files, `config.m4`, `config.w32`, `README.md`, `CREDITS`, and `LICENSE`. Development checkouts are read-only inputs and may live outside the Docker mount: the host streams only those files to the builder. Imported files, Git caches, and manifests are written by the builder without host-side ownership changes. Do not use an import destination as `PDO_PGLITE_DEV_PATH`.

Generated manifests and a pending-import journal allow the next build to repair interrupted imports, including newly added files not yet recorded in the successful manifest. Legacy imports and corrupt manifests adopt only the managed input classes above. Git metadata, compiled objects, and unrelated files are preserved; symlinked managed destinations are rejected. Repository caches are scoped by repository identity under `.cache/pdo-pglite-import/`.

Run the lightweight real-Make regression suite with:

```sh
node --test test/build/pdo-pglite-importer.test.mjs
docker build -f test/build/vrzno-importer.Dockerfile -t php-wasm-vrzno-importer test/build
PDO_PGLITE_IMPORTER_DOCKER=1 node --test test/build/pdo-pglite-importer.test.mjs
```

The existing lightweight importer image is shared with Vrzno. The Docker test requires a non-root host user and Docker access, and verifies root-owned builder output. CI requires both variants; root-only checks do not substitute for the ownership test.
