# pdo-cfd1

`pdo-cfd1` is the Cloudflare D1 PDO driver extension used by `php-wasm`.

This package is build-time plumbing for custom `php-wasm` bundles.
It does not expose a separate JavaScript entrypoint from this folder. At runtime, support is activated by passing Cloudflare D1 bindings into the `php-wasm` constructor.

## Requirements

`pdo_cfd1` requires PHP 8.1 or newer.

## Usage

```js
import { PhpWorker } from 'php-wasm/PhpWorker.mjs';

export default {
  async fetch(request, env) {
    const php = new PhpWorker({
      version: '8.4',
      cfd1: { mainDb: env.mainDb },
    });

    await php.run(`<?php
      $pdo = new PDO('cfd1:mainDb');
      var_dump($pdo instanceof PDO);
    `);

    return new Response('ok');
  },
};
```

## Custom Builds

Enable `WITH_PDO_CFD1=1` in `.php-wasm-rc`.

## Build Options

- `WITH_PDO_CFD1`: defaults to `0`. Set it to `1` to compile the extension into custom PHP builds.
- `PDO_CFD1_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `pdo-cfd1` repository during the build.
