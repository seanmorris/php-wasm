---
title: pdo-pglite
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/extensions/pdo-pglite.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# pdo-pglite

*pdo driver for pglite & php-wasm*

pdo_pglite requires PHP 8.1+.

Pass the PGlite object into the php-wasm constructor to enable pdo_pglite support:

```javascript
import { PGlite } from '@electric-sql/pglite';
const php = new PhpWeb({PGlite});
```

You can also load PGlite from a CDN:

```javascript
import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';
const php = new PhpWeb({PGlite});
```

## Connect & Configure

Once PGlite is passed in, `pgsql:` will be available as a PDO driver.

```javascript
import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js';
const php = new PhpWeb({PGlite});

php.run(`<?php
    $pdo = new PDO('pgsql:idb-storage');
`);
```

## Usage

Use pdo-pglite like you'd use any other PDO connector. Prepared statements, as well as positional & named placeholders are supported.

```javascript
import { PGlite } from '@electric-sql/pglite';
const php = new PhpWeb({PGlite});

php.run(`<?php
    $pdo = new PDO('pgsql:idb-storage');
    $stm = $pdo->prepare(
        'SELECT * FROM pg_catalog.pg_tables WHERE schemaname = :schema'
    );
    $out = fopen('php://stdout', 'w');

    $stm->execute([
        'schema' => 'pg_catalog'
    ]);

    $headers = false;
    while ($row = $stm->fetch(PDO::FETCH_ASSOC)) {
        if (!$headers) {
            fputcsv($out, array_keys($row));
            $headers = true;
        }
        fputcsv($out, $row);
    }
`);
```

### PHP/PostgreSQL in Static HTML

PGlite can also be used right from static HTML. Just pass it in the `data-imports` attribute on the php script tag, with the URL of the module as the key, where the value lists the imports from that module as an array.

```html
<script type = "text/php" data-imports = '{
    "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js": ["PGlite"]
}'>
```

You can see an example of this running in codepen:

<https://codepen.io/SeanMorris227/pen/GRVqYzR?editors=1000>

```html
<html>
<body>
    <script async type = "module" src = "./php-tags.mjs"></script>
    <script type = "text/php" data-stdout = "#output" data-stderr = "#error" data-imports = '{
        "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js": ["PGlite"]
    }'><?php
        $pdo = new PDO('pgsql:idb-storage');
        $stm = $pdo->prepare(
            'SELECT * FROM pg_catalog.pg_tables WHERE schemaname = :schema'
        );
        $out = fopen('php://stdout', 'w');

        $stm->execute([
            'schema' => 'pg_catalog'
        ]);

        $headers = false;
        while ($row = $stm->fetch(PDO::FETCH_ASSOC)) {
            if (!$headers) {
                fputcsv($out, array_keys($row));
                $headers = true;
            }
            fputcsv($out, $row);
        }
    </script>
    <pre id = "output"></pre>
    <pre id = "error"></pre>
</body>
</html>
```

## @electric-sql/pglite

`pdo_pglite` is powered by [@electric-sql/pglite](https://electric-sql.com/).

<https://github.com/electric-sql/pglite>

<https://electric-sql.com/>



