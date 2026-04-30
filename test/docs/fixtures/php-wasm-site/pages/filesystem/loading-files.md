---
title: Loading Files
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/filesystem/loading-files.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.js
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpNode.js
-->
# Loading Files

### Loading Single Files

The constructor method of the php-wasm objects accepts a `files` parameter to load files into the filesystem by URL. For example, the `php-intl` extension requires us to load `icudt72l.dat` into the  `/preload` directory.

```javascript
const sharedLibs = [`https://unpkg.com/php-wasm-intl/php\${PHP_VERSION}-intl.so`];

const files = [
	{
		name: 'icudt72l.dat',
		parent: '/preload/',
		url: 'https://unpkg.com/php-wasm-intl/icudt72l.dat'
	}
];

const php = new PhpWeb({sharedLibs, files});
```

### Preloaded FS

Use the `PRELOAD_ASSETS` key in your `.php-wasm-rc` file to define a list of files and directories to include by default.

See [compiling/php-wasm-rc.html#preload_assets](/compiling/php-wasm-rc.html#preload_assets) for more information.

### locateFile

You can provide the `locateFile` option to php-wasm as a callback to map the names of files to URLs where they're loaded from. Returning `undefined` will fallback to the default behavior.

This option is useful if your static assets are served from a different directory than your JavaScript files. It applies to .wasm files, shared libraries, single files, and preloaded FS packages in .data files.

```javascript
const php = new PhpWeb({locateFile: filename => `/my/static/path/${filename}`});
```

## Persistent Storage

### IDBFS (Web & Worker)

To use IDBFS in PhpWeb, pass a `persist` object with a `mountPath` key. The value of `mountPath` will be used as the path to the persistent directory within the PHP environment.

```javascript
const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');

const php = new PhpWeb({persist: {mountPath: '/persist'}});
```

### NodeFS (Node.js Only)

To use NodeFS in PhpWeb, pass a `persist` object with `mountPath` & `localPath` keys.

`localPath` will be used as the path to the HOST directory to expose to PHP.
`mountPath` will be used as the path to the persistent directory within the PHP environment.

```javascript
const { PhpNode } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpNode.mjs');

const php = new PhpNode({persist: {mountPath: '/persist', localPath: '~/your-files'}});
```
