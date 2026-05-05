# php-wasm-intl

`php-wasm-intl` provides the `intl` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-intl
```

## What It Loads

The package resolves the active runtime version to `php8.x-intl.so`, bundles the ICU shared libraries, and preloads `icudt72l.dat` into `/preload`.
Using the module form is the simplest way to get both the extension and its data file mounted correctly.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import intl from 'php-wasm-intl';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [intl],
});

await php.run(`<?php
  $formatter = new NumberFormatter('en-US', NumberFormatter::CURRENCY);
  var_dump($formatter->format(100.00));
`);
```

## Custom Builds

Enable `WITH_INTL` in `.php-wasm-rc`.

## Build Options

- `WITH_INTL`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
- Shared, static, and dynamic Intl builds emit the ICU side libraries plus the `icudt72l.dat` preload asset.
