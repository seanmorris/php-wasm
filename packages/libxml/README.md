# php-wasm-libxml

`php-wasm-libxml` provides the `libxml2.so` support library used by the XML-family extensions in `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-libxml
```

## What It Loads

This package does not register a separate PHP extension module.
It only supplies `libxml2.so` so packages like `php-wasm-dom`, `php-wasm-xml`, and `php-wasm-simplexml` can be loaded as shared or dynamic extensions.

The stock `php-wasm` runtime already includes the core `libxml` extension, so most consumers only need this package when they are composing XML-related shared libraries explicitly.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [libxml, dom],
});
```

## Custom Builds

Enable `WITH_LIBXML` in `.php-wasm-rc` when you want libxml built outside the base runtime.

## Build Options

- `WITH_LIBXML`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
- The `dynamic` mode is what the XML-family side-module packages rely on when they need `libxml2.so` at runtime.
