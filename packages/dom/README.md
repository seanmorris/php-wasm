# php-wasm-dom

`php-wasm-dom` provides the `dom` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libxml php-wasm-dom
```

## What It Loads

The package resolves the active runtime version to `php8.x-dom.so`.
Load `php-wasm-libxml` alongside it when you are using DOM as a shared or dynamic extension.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [libxml, dom],
});

await php.run(`<?php var_dump(extension_loaded('dom'));`);
```

## Custom Builds

Enable `WITH_DOM` in `.php-wasm-rc`.
Shared and dynamic DOM builds also need `WITH_LIBXML` enabled.

## Build Options

- `WITH_DOM`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_LIBXML`: `WITH_DOM=static` requires `WITH_LIBXML=static`. `WITH_DOM=dynamic` requires libxml to be enabled in the build.
