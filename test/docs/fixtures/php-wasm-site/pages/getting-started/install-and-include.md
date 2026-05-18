---
title: Install & Import
weight: -900
---
<!--
Vendored from php-wasm-site working tree based on commit 842858b6c6158724c05beace20929ba35793ff57
Source: https://github.com/seanmorris/php-wasm-site/blob/842858b6c6158724c05beace20929ba35793ff57/pages/getting-started/install-and-include.md
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
$ npm i php-wasm-builder
```

### Latest nightly build

If you want the newest unpublished artifacts instead of the npm packages, use the latest successful `Build Artifacts` workflow run from GitHub Actions.

If you specifically need the long-lived `develop` artifacts, the latest successful `develop`-branch build is still the February 24, 2026 run:

- `Build Artifacts` run `#92`
- GitHub Actions run ID `22360005357`
- Branch: `develop`
- Versions built: PHP `8.0` through `8.5`
- Library modes built: `static`, `shared`, and `dynamic`
- Discord: nightly builds are announced in `#nightly-builds`

Link:

<https://github.com/seanmorris/php-wasm/actions/runs/22360005357>

#### Pre-Packaged Static Assets:

If you're using a bundler, use the vendor's documentation to learn how to move the files matching the following pattern to your public directory:

```bash
node_modules/php-wasm/php8.4-web.mjs.wasm
node_modules/php-cgi-wasm/php8.4-cgi-worker.mjs.wasm
```

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

For `0.1.0`, use the published entrypoints across the runtime packages.

- `php-wasm/PhpNode`
- `php-cgi-wasm/PhpCgiNode`
- `php-cli-wasm/PhpCliNode`
- `php-dbg-wasm/PhpDbgNode`

Browser and worker entrypoints remain ESM-only.

Extension helper JS packages also remain ESM-only. Their helper modules use `import.meta.url` to resolve static assets, and there is no universal CommonJS equivalent for that pattern.

When you need to manage runtime-loadable extensions from CommonJS, load the core runtime with `require()` and provide the extension `.so`, `.data`, `.wasm`, and support-library assets yourself via `sharedLibs`, `dynamicLibs`, `files`, and `locateFile`.
