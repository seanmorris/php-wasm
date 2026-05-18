# php-wasm-xmlwriter

`php-wasm-xmlwriter` provides the `xmlwriter` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libxml php-wasm-xmlwriter
```

## What It Loads

The package resolves the active runtime version to `php8.x-xmlwriter.so`.
Load `php-wasm-libxml` alongside it when you are using XMLWriter as a shared or dynamic extension.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import libxml from 'php-wasm-libxml';
import xmlwriter from 'php-wasm-xmlwriter';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [libxml, xmlwriter],
});

await php.run(`<?php var_dump(extension_loaded('xmlwriter'));`);
```

## Custom Builds

Enable `WITH_XMLWRITER` in `.php-wasm-rc`.
Shared and dynamic XMLWriter builds also need `WITH_LIBXML` enabled.

## Build Options

- `WITH_XMLWRITER`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_LIBXML`: `WITH_XMLWRITER=static` requires `WITH_LIBXML=static`. `WITH_XMLWRITER=dynamic` requires libxml to be enabled in the build.
