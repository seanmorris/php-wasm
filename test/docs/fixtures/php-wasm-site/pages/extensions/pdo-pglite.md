---
title: pdo-pglite
---
<!--
Vendored from php-wasm-site commit 3ba91aac4946c53c89d0fdfa6ea10eadd8d27684
Source: https://github.com/seanmorris/php-wasm-site/blob/3ba91aac4946c53c89d0fdfa6ea10eadd8d27684/pages/extensions/pdo-pglite.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# pdo-pglite

`pdo-pglite` is the PostgreSQL-flavored PDO driver for `php-wasm`, powered by
[`@electric-sql/pglite`](https://electric-sql.com/). It lets PHP use a
browser-local PGlite database through the standard PDO API.

PHP 8.1 or newer and the Vrzno extension are required. Custom builds must set
both `WITH_PDO_PGLITE=1` and `WITH_VRZNO=1`.

## Install and Enable

Install matching runtime and database packages:

```sh
npm install php-wasm pdo-pglite @electric-sql/pglite@^0.5.8
```

Pass the `PGlite` constructor into the runtime. The `pgsql:` PDO driver becomes
available once the constructor is present.

```javascript
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import { PGlite } from '@electric-sql/pglite';

const php = new PhpWeb({
    version: '8.4',
    PGlite,
});
```

PGlite can also be imported from a pinned CDN URL:

```javascript
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js';

const php = new PhpWeb({PGlite});
```

If `PGlite` is not passed into the runtime, a `pgsql:` connection cannot create
its backing database.

## Open and Query a Database

This DSN opens an IndexedDB-backed PGlite database named
`pdo-pglite-pg18`:

```javascript
await php.run(`<?php
    $pdo = new PDO('pgsql:idb://pdo-pglite-pg18');
    var_dump($pdo instanceof PDO);
`);
```

Prepared statements support both positional and named placeholders.

```javascript
await php.run(`<?php
    $pdo = new PDO('pgsql:idb://pdo-pglite-pg18');

    $pdo->exec('
        CREATE TABLE IF NOT EXISTS notes (
            id   SERIAL PRIMARY KEY,
            body TEXT NOT NULL
        )
    ');

    $insert = $pdo->prepare('INSERT INTO notes (body) VALUES (:body)');
    $insert->execute(['body' => 'hello from php']);

    foreach ($pdo->query('SELECT id, body FROM notes ORDER BY id') as $row) {
        var_dump($row);
    }
`);
```

## Static HTML

Import `PGlite` through `data-imports`, then connect through PDO from PHP:

```html
<script async type="module" src="./php-tags.mjs"></script>

<script
    type="text/php"
    data-stdout="#output"
    data-stderr="#error"
    data-imports='{
        "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js": ["PGlite"]
    }'
><?php
    $pdo = new PDO('pgsql:idb://pdo-pglite-pg18');
    $pdo->exec('CREATE TABLE IF NOT EXISTS messages (body TEXT NOT NULL)');
    $pdo->prepare('INSERT INTO messages (body) VALUES (?)')->execute(['hello']);

    foreach ($pdo->query('SELECT body FROM messages') as $row) {
        echo $row['body'], PHP_EOL;
    }
?></script>

<pre id="output"></pre>
<pre id="error"></pre>
```

## Upgrade Persisted Databases

PGlite 0.5 uses PostgreSQL 18. A database directory created by PGlite 0.2
(PostgreSQL 16) cannot be opened in place by PGlite 0.5.

Export the old database logically with its original PGlite version, restore it
into a new database name such as `idb://pdo-pglite-pg18`, and change the PDO DSN
only after the restore succeeds. Do not copy a `dumpDataDir()` archive directly
between these PostgreSQL versions.

See the [PGlite upgrade guide](https://pglite.dev/docs/upgrade) and
[PGlite tools documentation](https://pglite.dev/docs/pglite-tools).
