# php-wasm-phar

`php-wasm-phar` provides the `phar` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-phar
```

## What It Loads

The package resolves the active runtime version to `php8.x-phar.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import phar from 'php-wasm-phar';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [phar],
});

await php.run(`<?php var_dump(extension_loaded('phar'));`);
```

PHP can read archive members using paths such as `phar:///persist/app.phar/hello.txt`.
The JavaScript filesystem methods operate on the archive file itself; use PHP's
stream functions to read, list or modify its members.

For gzip-compressed archives or entries, enable the zlib extension too:

```sh
npm install php-wasm-zlib
```

```js
import zlib from 'php-wasm-zlib';

const php = new PhpWeb({sharedLibs: [zlib, phar]});
```

The zlib package supplies its native library automatically. Phar does not require
zlib for uncompressed archives. Static builds can compile these extensions in
instead of loading them through `sharedLibs`.

PHP defaults to `phar.readonly=1`. To create or modify executable archives, set
`ini: 'phar.readonly=0'` when constructing the runtime. Append mode is unsupported;
replace an archive member using `file_put_contents()` or the `Phar` API.

CGI applications can use a `Phar::webPhar()` stub to serve PHP scripts and assets
inside an archive. See [CGI archive routing](../php-cgi-wasm/README.md#phar-applications).

The stream tests exercise reads, writes, includes, gzip and error handling. Their
small committed archives can be regenerated with
`php -d phar.readonly=0 packages/phar/test/fixtures/generate.php` from the repository root.

## Custom Builds

Enable `WITH_PHAR` in `.php-wasm-rc`.

## Build Options

- `WITH_PHAR`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `dynamic`.
