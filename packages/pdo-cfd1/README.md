# pdo-cfd1

`pdo-cfd1` is the Cloudflare D1 PDO driver extension used by `php-wasm`.

This package exists mainly so custom `php-wasm` builds can vendor and compile the `pdo_cfd1` extension.
It does not ship a separate JavaScript entrypoint from this folder.
At runtime, support is enabled by passing Cloudflare D1 bindings into the PHP runtime.

The pinned upstream driver targets PHP 8.0–8.5 and includes the PHP 8.0 PDO
callback adapters. Its source is imported directly without a compatibility patch.

## Runtime Setup

Pass your Worker's D1 bindings into the `cfd1` object when you construct the runtime.
Each key becomes a PDO target name inside PHP.

```js
// The version-bound entry and its runtime/Wasm files come from the
// Cloudflare build profile. Keep those files together when bundling.
import { PhpCloudflare } from './php8.3-cloudflare.mjs';

export default {
  async fetch(request, env) {
    const php = new PhpCloudflare({
      cfd1: {
        mainDb: env.mainDb,
      },
    });

    await php.run(`<?php
      $pdo = new PDO('cfd1:mainDb');
      var_dump($pdo instanceof PDO);
    `);

    return new Response('ok');
  },
};
```

## Querying D1 Through PDO

Once the binding is present, use `cfd1:<bindingName>` as the DSN:

```js
await php.run(`<?php
  $pdo = new PDO('cfd1:mainDb');

  $select = $pdo->prepare(
    'SELECT PageTitle, PageContent FROM WikiPages WHERE PageTitle = ?'
  );

  $select->execute(['Home']);

  $page = $select->fetch(PDO::FETCH_ASSOC);
  var_dump($page);
`);
```

## Supported PDO Operations

- Positional prepared queries: `prepare()`, `execute()`, `fetch()`, and `fetchAll()`.
- `INSERT`, `SELECT`, `UPDATE`, and `DELETE`, including repeated execution of a prepared statement.
- Numeric `bindValue()` and `bindParam()` positions; bound references are read again for each execution.
- Null, string, numeric, and boolean parameter values, subject to PDO's requested parameter type.
- Forward-only cursors and `closeCursor()` followed by re-execution.
- Write `rowCount()` from D1's `meta.changes`; do not use it to count SELECT results.

Only bare `?` placeholders are supported. Named placeholders and numbered
placeholders such as `?1` are rejected. Placeholder-like text inside SQL strings,
quoted identifiers, and comments is not treated as a parameter.

D1 failures become normal PDO errors: exception mode throws `PDOException`,
and silent mode returns `false` with `errorCode()`/`errorInfo()`. Missing or
malformed bindings fail the PDO constructor. Failed queries do not report success
or retain an earlier result set.

`PDO::exec()`, `quote()`, `lastInsertId()`, PDO transaction methods, persistent
connections, output parameters, scrollable cursors, multiple result sets, and
driver-specific attributes/column metadata are unsupported. They fail explicitly;
they do not emulate transactions or return placeholder success values. Use
prepared queries instead of `exec()` or manually quoting values. Use D1's native
JavaScript APIs separately when the application needs features outside this PDO
subset.

Results are buffered in the Worker, not streamed. An empty result set has no
column names available through this D1 result interface. Binary/BLOB parameter
and result mapping is not part of this driver's supported contract.

## Scope

- This is for `php-wasm` runtimes that execute in a Cloudflare Worker-compatible environment.
- Most consumers of the published `php-wasm` packages do not import anything from this package directly.
- If you are only using browser or Node runtimes, this extension is usually irrelevant.

## Custom Builds

Enable the extension in `.php-wasm-rc`:

```sh
WITH_PDO_CFD1=1
WITH_VRZNO=1
```

Build-related variables:

- `WITH_PDO_CFD1`: defaults to `0`. Set it to `1` to compile the extension into a custom build.
- `WITH_VRZNO`: must be `1`; the driver uses Vrzno's value conversion bridge.
- `PDO_CFD1_REPOSITORY`: defaults to `https://github.com/seanmorris/pdo-cfd1.git`.
- `PDO_CFD1_REF`: defaults to immutable commit `2ae7992f9bf4c0dbd2fceb014d84430f4cc04a48`.
- `PDO_CFD1_DEV_PATH`: optional external checkout, read without modifying it.

The importer records the resolved commit (or development path) and each source
file's SHA-256 in `.php-wasm-source.json`. The PHP configure/build dependencies
use that manifest. Unchanged imports preserve modification times; changed or
missing inputs are repaired before the next build. Restored manifests from the
previous patched driver are migrated to the directly imported source.

Custom refs and development checkouts supply the driver source as-is. Choose a
revision compatible with the target PHP version. Driver unit tests are maintained
in the upstream PDO-CFD1 repository; php-wasm keeps importer, packaging, and real
PHP/Asyncify/D1 integration coverage.
