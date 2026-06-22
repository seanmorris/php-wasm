# php-wasm-intl

`php-wasm-intl` provides the `intl` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-intl
```

## What It Loads

In dynamic builds, the package resolves the active runtime version to `php8.x-intl.so`, loads the ICU shared libraries, and preloads `icudt72l.dat` into `/preload`.

In shared builds, the `intl` extension is already built into the base runtime, so only the ICU `libicu*.so` support libraries and `icudt72l.dat` should be loaded at startup.

In static builds, `icudt72l.dat` is bundled into the runtime `.data` payload.

Using the module form is the simplest way to get the right combination for dynamic builds.
Shared runtimes should load only the ICU support libraries and `icudt72l.dat`, not `php8.x-intl.so`.

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

The example above is a dynamic-build example.

For shared builds, keep the built-in `intl` extension and inject only the ICU support files:

```js
const sharedLibs = [
  { name: 'libicuuc.so',   url: 'https://unpkg.com/php-wasm-intl/libicuuc.so' },
  { name: 'libicutu.so',   url: 'https://unpkg.com/php-wasm-intl/libicutu.so' },
  { name: 'libicutest.so', url: 'https://unpkg.com/php-wasm-intl/libicutest.so' },
  { name: 'libicuio.so',   url: 'https://unpkg.com/php-wasm-intl/libicuio.so' },
  { name: 'libicui18n.so', url: 'https://unpkg.com/php-wasm-intl/libicui18n.so' },
  { name: 'libicudata.so', url: 'https://unpkg.com/php-wasm-intl/libicudata.so' },
];

const files = [
  {
    name: 'icudt72l.dat',
    path: '/preload/icudt72l.dat',
    url: 'https://unpkg.com/php-wasm-intl/icudt72l.dat'
  }
];
```

## Custom Builds

Enable `WITH_INTL` in `.php-wasm-rc`.

## Build Options

- `WITH_INTL`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
- Dynamic builds emit the extension side-module, ICU side libraries, and the `icudt72l.dat` preload asset.
- Shared builds emit the ICU side libraries and the `icudt72l.dat` preload asset.
- Static builds bundle `icudt72l.dat` into the runtime preload archive.
