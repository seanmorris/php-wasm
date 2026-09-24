---
title: pdo-cfd1
---
<!--
Vendored from php-wasm-site commit bdf1555ad207242ac09292ff05b125f006a9d049
Source: https://github.com/seanmorris/php-wasm-site/blob/bdf1555ad207242ac09292ff05b125f006a9d049/pages/extensions/pdo-cfd1.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# pdo-cfd1

`pdo-cfd1` connects PHP's PDO interface to actual Cloudflare D1 bindings.
The dedicated **`php-cloud-wasm`** profile statically includes the driver for
PHP 8.0–8.5, including the upstream PHP 8.0 PDO callback adapters.
It does not require a browser/Node extension loader.

Start with [PHP in Cloudflare](/getting-started/php-in-cloudflare.html) for the
complete build, raw Wasm module upload, Pages configuration and deployment guide.
An ordinary `PhpWorker` build is not interchangeable with this Cloudflare profile.

## Runtime setup

Import a version-bound entry from the complete package and create the PHP
instance inside each Worker request:

```javascript
import { PhpCloudflare } from './php-cloud-wasm/php8.5-cloudflare.mjs';

const php = new PhpCloudflare({
  cfd1: { mainDb: env.DB },
});
```

The example assumes a copied package beside your Worker entry. `env.DB` is the
Worker's configured D1 binding; `mainDb` is the PHP-facing name. The generated
entry supplies the matching precompiled Wasm module and runtime factory.

## Query D1 through PDO

Use `cfd1:<mapKey>` and prepared-statement parameters:

```javascript
await php.run(`<?php
  $pdo = new PDO('cfd1:mainDb', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  ]);
  $query = $pdo->prepare('SELECT ? AS answer');
  $query->execute([42]);
  echo json_encode($query->fetch(PDO::FETCH_ASSOC));
`);
```

This query needs no schema. Capture the runtime's `output` event to form the
HTTP response, as shown in the setup guide. Ordinary `execute([...])` does not
require explicit binding and uses PDO's default `PDO::PARAM_STR` convention.
Use typed `bindValue` or `bindParam` when integer, boolean, NULL, or BLOB types
matter. Numeric binding positions start at 1; numeric execute-array keys start
at 0. Named parameters accept names with or without the leading colon.

## Supported scope and errors

- Bare `?`, numbered `?NNN`, and PDO-style `:name` parameters. Repeated names
  reuse one value; do not mix named and positional parameters in a statement.
- `query()`, `exec()`, repeated `execute()`, normal PDO fetch modes, and cursor
  reuse. Write `rowCount()` uses D1's changes count, not the SELECT result size.
- `quote()` for text and BLOB literals, and per-connection `lastInsertId()`.
  Insert IDs outside JavaScript's safe integer range cannot be reported exactly;
  use an explicit text-valued `RETURNING` query when needed.
- Binary strings and readable streams through `PDO::PARAM_LOB`, with binary
  strings returned for BLOB results. Empty BLOBs remain distinct from NULL.
- Buffered scroll cursors selected with `PDO::CURSOR_SCROLL`, and
  `getColumnMeta()` based on observed result values. D1 does not supply table
  origins or declared schema metadata through this result interface.
- Missing bindings and failed queries report PDO errors. Exception mode raises
  `PDOException`; warning and silent modes return `false` with error details.

## Atomic batches

`cfd1Batch()` submits distinct prepared statements from the same PDO connection
as one atomic D1 batch. Bind parameters before submitting them:

```php
$insert = $pdo->prepare('INSERT INTO users (name) VALUES (:name)');
$insert->bindValue('name', 'Alice');
$select = $pdo->prepare('SELECT name FROM users ORDER BY name');
$pdo->cfd1Batch([$insert, $select]);
$users = $select->fetchAll(PDO::FETCH_ASSOC);
```

The example assumes a `users` table with a `name` column. Each statement receives
its own results and affected-row count. Validation occurs before submission;
database statement failures roll back the batch. Transport failures are not
retried automatically because the commit outcome may be unknown. Do not call
`execute()` just to populate batch bindings: it executes that statement immediately.

Open PDO transactions, persistent connections, output parameters, streaming
cursors, multiple result sets, and `@name` / `$name` placeholders remain
unsupported. A batch is a predetermined group; PHP cannot read intermediate
results and choose additional statements inside it. See the integration guide
below for parameter limits, cursor behavior, metadata and error details.

The Cloudflare build imports the pinned upstream driver directly, without an
ad-hoc compatibility patch. Custom builds can select `PDO_CFD1_REF` or a local
`PDO_CFD1_DEV_PATH`. The [legacy php-static PDO example](https://github.com/seanmorris/php-static/blob/cdcaa8540cd7fcdeb445e65dba35a9882acefa7d/pdo.php)
uses a `vrzno:` DSN, which must be migrated to the binding map and `cfd1:` API
above.

See the [PDO-CFD1 integration guide](https://github.com/seanmorris/php-wasm/blob/master/packages/pdo-cfd1/README.md),
[upstream driver](https://github.com/seanmorris/pdo-cfd1), and
[Cloudflare D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases).
