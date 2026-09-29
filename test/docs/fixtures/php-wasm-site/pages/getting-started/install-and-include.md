---
title: Install & Import
weight: -900
---
<!--
Vendored from php-wasm-site commit e7dea4386c6099cfc1c0e510e636bb09ec051426
Source: https://github.com/seanmorris/php-wasm-site/blob/e7dea4386c6099cfc1c0e510e636bb09ec051426/pages/getting-started/install-and-include.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/packages/php-wasm/PhpWeb.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/packages/php-cgi-wasm/PhpCgiNode.mjs
-->
# Install & Import php-wasm

Include the module in your preferred format:

## From a CDN

Using ESM modules, you can import php-wasm directly from a CDN:

### jsDelivr

```javascript
const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');
const php = new PhpWeb;
```

### unpkg

```javascript
const { PhpWeb } = await import('https://unpkg.com/php-wasm/PhpWeb.mjs');
const php = new PhpWeb;
```

## Installing with npm

You can also install php-wasm with npm.

[Find php-wasm on npm](https://www.npmjs.com/package/php-wasm)

### Current packages

```sh
$ npm i php-wasm
$ npm i php-cgi-wasm
$ npm i php-cli-wasm
$ npm i php-dbg-wasm
$ npm i php-sdl-wasm
$ npm i php-cloud-wasm
$ npm i php-wasm-builder
```

### Latest nightly build

If you want the newest unpublished artifacts instead of the npm packages, use a
[successful `develop` run of the Build Artifacts workflow](https://github.com/seanmorris/php-wasm/actions/workflows/build.yaml?query=branch%3Adevelop+conclusion%3Asuccess).
Nightly builds are announced in the `#nightly-builds` channel on Discord.

### Pre-Packaged Static Assets

Each runtime module loads its WebAssembly binary with
`new URL('<hash>.wasm', import.meta.url)`. Bundlers that understand this
pattern, such as Vite and webpack 5, emit the binary automatically.

Otherwise, copy the binary referenced by each runtime you import next to the
bundled module. It is named by its SHA-1 hash, which changes with every build:

```bash
grep -o '[0-9a-f]\{40\}\.wasm' node_modules/php-wasm/php8.4-web.mjs | sort -u
grep -o '[0-9a-f]\{40\}\.wasm' node_modules/php-cgi-wasm/php8.4-cgi-worker.mjs | sort -u
```

Repeat this after upgrading, and for each PHP version and runtime you import.

## Importing the module

### ESM

```javascript
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
const php = new PhpWeb;
```

### CommonJS Node runtimes

```javascript
const { PhpNode } = require('php-wasm/PhpNode');

const php = new PhpNode({version: '8.5'});
```

### Module Format

Core Node runtimes support both ESM and CommonJS.

For `0.2.0`, use the published entrypoints across the runtime packages.

- `php-wasm/PhpNode`
- `php-cgi-wasm/PhpCgiNode`
- `php-cli-wasm/PhpCliNode`
- `php-dbg-wasm/PhpDbgNode`

Browser and worker entrypoints remain ESM-only.

Extension helper JS packages also remain ESM-only. Their helper modules use `import.meta.url` to resolve static assets, and there is no universal CommonJS equivalent for that pattern.

When you need to manage runtime-loadable extensions from CommonJS, load the core runtime with `require()` and provide the extension `.so`, `.data`, `.wasm`, and support-library assets yourself via `sharedLibs`, `dynamicLibs`, `files`, and `locateFile`.
