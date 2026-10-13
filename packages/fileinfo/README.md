# php-wasm-fileinfo

`php-wasm-fileinfo` provides the `fileinfo` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-fileinfo
```

## What It Loads

The package resolves the active runtime version to `php8.x-fileinfo.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import fileinfo from 'php-wasm-fileinfo';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [fileinfo],
});

await php.run(`<?php
  $finfo = new finfo(FILEINFO_MIME_TYPE);
  echo $finfo->buffer('%PDF-1.4');
`);
```

The magic database is compiled into the extension, so no extra files are needed.
Static builds can compile the extension in instead of loading it through `sharedLibs`.

## Custom Builds

Enable `WITH_FILEINFO` in `.php-wasm-rc`.

## Build Options

- `WITH_FILEINFO`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
