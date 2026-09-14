---
title: pdo-cfd1
---
<!--
Vendored from php-wasm-site commit 3ba91aac4946c53c89d0fdfa6ea10eadd8d27684
Source: https://github.com/seanmorris/php-wasm-site/blob/3ba91aac4946c53c89d0fdfa6ea10eadd8d27684/pages/extensions/pdo-cfd1.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# pdo-cfd1

`pdo-cfd1` is the Cloudflare D1 PDO driver extension for `php-wasm`. It targets
PHP runtimes executing in a Cloudflare Worker-compatible environment and
requires PHP 8.1 or newer.

## Runtime Setup

Pass Worker D1 bindings into the runtime's `cfd1` object. Each object key
becomes the name used by a `cfd1:` PDO DSN.

```javascript
import { PhpWorker } from 'php-wasm/PhpWorker.mjs';

export default {
    async fetch(request, env) {
        const php = new PhpWorker({
            version: '8.4',
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

`phpinfo()` reports whether the runtime detected the Cloudflare D1 module.

![pdo-cfd1 phpinfo output](https://raw.githubusercontent.com/seanmorris/pdo-cfd1/refs/heads/master/phpinfo.png)

## Query D1 Through PDO

Use `cfd1:<bindingName>` as the DSN. Positional prepared-statement parameters
are supported.

```javascript
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

## Custom Builds

Enable the extension in `.php-wasm-rc`:

```make
WITH_PDO_CFD1=1
```

`PDO_CFD1_DEV_PATH` can point to a local `pdo-cfd1` checkout instead of cloning
the upstream repository during the build.

Most browser and Node applications do not need this extension. It is intended
for runtimes with access to actual Cloudflare D1 bindings.

## Current Limitations

- Only positional replacement tokens are supported.
- Database error propagation remains limited.

See the [pdo-cfd1 repository](https://github.com/seanmorris/pdo-cfd1) and
[Cloudflare D1 documentation](https://developers.cloudflare.com/d1/).
