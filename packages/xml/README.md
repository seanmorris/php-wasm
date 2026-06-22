# php-wasm-xml

`php-wasm-xml` provides the `xml` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libxml php-wasm-xml
```

## What It Loads

The package resolves the active runtime version to `php8.x-xml.so`.
Load `php-wasm-libxml` alongside it when you are using XML as a shared or dynamic extension.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import libxml from 'php-wasm-libxml';
import xml from 'php-wasm-xml';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [libxml, xml],
});

await php.run(`<?php var_dump(extension_loaded('xml'));`);
```

## Custom Builds

Enable `WITH_XML` in `.php-wasm-rc`.
Shared and dynamic XML builds also need `WITH_LIBXML` enabled.

## Build Options

- `WITH_XML`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_LIBXML`: `WITH_XML=static` requires `WITH_LIBXML=static`. `WITH_XML=dynamic` requires libxml to be enabled in the build.
