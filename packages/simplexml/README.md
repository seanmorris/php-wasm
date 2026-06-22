# php-wasm-simplexml

`php-wasm-simplexml` provides the `SimpleXML` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libxml php-wasm-simplexml
```

## What It Loads

The package resolves the active runtime version to `php8.x-simplexml.so`.
Load `php-wasm-libxml` alongside it when you are using SimpleXML as a shared or dynamic extension.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import libxml from 'php-wasm-libxml';
import simplexml from 'php-wasm-simplexml';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [libxml, simplexml],
});

await php.run(`<?php var_dump(extension_loaded('SimpleXML'));`);
```

## Custom Builds

Enable `WITH_SIMPLEXML` in `.php-wasm-rc`.
Shared and dynamic SimpleXML builds also need `WITH_LIBXML` enabled.

## Build Options

- `WITH_SIMPLEXML`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_LIBXML`: `WITH_SIMPLEXML=static` requires `WITH_LIBXML=static`. `WITH_SIMPLEXML=dynamic` requires libxml to be enabled in the build.
