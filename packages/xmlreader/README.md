# php-wasm-xmlreader

`php-wasm-xmlreader` provides the `xmlreader` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libxml php-wasm-dom php-wasm-xmlreader
```

## What It Loads

Dynamic builds resolve the active runtime version to `php8.x-xmlreader.so`.
Load `php-wasm-libxml` and `php-wasm-dom` alongside it when those dependencies are also dynamic.

Shared and static builds may already include some or all of the `libxml`, `dom`, and `xmlreader` pieces in the base runtime. In those modes, callers should only explicitly load the packages whose own `WITH_*` mode is `dynamic`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';
import xmlreader from 'php-wasm-xmlreader';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [libxml, dom, xmlreader],
});

await php.run(`<?php var_dump(extension_loaded('xmlreader'));`);
```

## Custom Builds

Enable `WITH_XMLREADER` in `.php-wasm-rc`.
Static XMLReader builds also need `WITH_LIBXML=static` and `WITH_DOM=static`.
Dynamic XMLReader builds require both `libxml` and `dom` to be enabled in the build.
Shared XMLReader builds require `WITH_LIBXML=shared` and `WITH_DOM=shared`, but the extensions remain built in.

## Build Options

- `WITH_XMLREADER`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
- `WITH_LIBXML`: `WITH_XMLREADER=static` requires `WITH_LIBXML=static`. Dynamic XMLReader builds require libxml to be enabled in the build.
- `WITH_DOM`: `WITH_XMLREADER=static` requires `WITH_DOM=static`. Dynamic XMLReader builds require DOM to be enabled in the build.

In mixed-mode builds, follow each dependency's own mode:

- if `WITH_XMLREADER=dynamic`, load `php-wasm-xmlreader`
- if `WITH_DOM=dynamic`, load `php-wasm-dom`
- if `WITH_LIBXML=dynamic`, load `php-wasm-libxml`
- if any of those are `shared` or `static`, do not explicitly load that extension package at runtime
