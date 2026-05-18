# pdo-cfd1

`pdo-cfd1` is the Cloudflare D1 PDO driver extension used by `php-wasm`.

This package exists mainly so custom `php-wasm` builds can vendor and compile the `pdo_cfd1` extension.
It does not ship a separate JavaScript entrypoint from this folder.
At runtime, support is enabled by passing Cloudflare D1 bindings into the PHP runtime.

`pdo_cfd1` requires PHP 8.1 or newer.

## Runtime Setup

Pass your Worker's D1 bindings into the `cfd1` object when you construct the runtime.
Each key becomes a PDO target name inside PHP.

```js
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

## Scope

- This is for `php-wasm` runtimes that execute in a Cloudflare Worker-compatible environment.
- Most consumers of the published `php-wasm` packages do not import anything from this package directly.
- If you are only using browser or Node runtimes, this extension is usually irrelevant.

## Custom Builds

Enable the extension in `.php-wasm-rc`:

```sh
WITH_PDO_CFD1=1
```

Build-related variables:

- `WITH_PDO_CFD1`: defaults to `0`. Set it to `1` to compile the extension into a custom build.
- `PDO_CFD1_DEV_PATH`: optional local checkout used instead of cloning the upstream repository during the build.
