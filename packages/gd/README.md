# php-wasm-gd

`php-wasm-gd` provides the `gd` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-zlib php-wasm-gd
```

## What It Loads

The package resolves the active runtime version to `php8.x-gd.so` and bundles `libfreetype.so`, `libjpeg.so`, `libpng.so`, and `libwebp.so`.
Load `php-wasm-zlib` alongside it because GD depends on `libz.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import zlib from 'php-wasm-zlib';
import gd from 'php-wasm-gd';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [zlib, gd],
});

await php.run(`<?php var_dump(extension_loaded('gd'));`);
```

## Custom Builds

Enable `WITH_GD` in `.php-wasm-rc`.
Feature-complete GD builds usually also enable the matching image and font dependencies such as zlib, PNG, JPEG, WebP, and FreeType.

## Build Options

- `WITH_GD`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_FREETYPE`, `WITH_LIBJPEG`, `WITH_LIBPNG`, `WITH_LIBWEBP`: each defaults to `shared`. Allowed values: `0`, `1`, `static`, `shared`.
- Those companion library flags control whether the GD side libraries are built and emitted alongside `php8.x-gd.so`.
