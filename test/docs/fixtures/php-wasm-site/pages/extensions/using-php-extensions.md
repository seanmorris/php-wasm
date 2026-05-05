---
title: Using PHP Extensions
weight: -1000
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/extensions/using-php-extensions.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.js
-->
# Using PHP Extensions

PHP extensions are provided as ESM modules.

You can pass an array as the `sharedLibs` argument to the constructor from Javascript to automatically generate an ini file that loads your extensions.

```javascript
import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';

const php = new PhpWeb({sharedLibs: [
	libxml,
	dom,
]});
```

You can also use the `dynamicLibs` argument to get similar behavior **without** automatically loading the extension. A PHP script can call the `dl()` function to dynamically load the extension at runtime:

```javascript
import libxml from 'php-wasm-libxml';
import dom from 'php-wasm-dom';

const php = new PhpWeb({dynamicLibs: [
	libxml,
	dom,
]});
```

```php
<?php
// Load the extension at runtime
dl('php8.4-dom.so');
```

## Dynamic Imports for Extensions

You can also load extensions modules dynamically:

```javascript
// This will load both sqlite.so & php8.x-sqlite.so:
const php = new PhpWeb({sharedLibs: [
	await import('https://unpkg.com/php-wasm-sqlite')
]});
```

Unfortunately, this notation is not available for Service Workers, as they do not yet support dynamic `imports()`. Hopefully this will change soon.

## Loading extensions manually


If you're in an environment where ESM is unavailable, you can provide the extensions manually.


The first codeblock is shorthand for the second. Passing `ini: true` will automatically load the extension via `/php.ini`, passing `ini: false` will wait for a call to `dl()` to do the lookup.

```javascript
const php = new PhpWeb({sharedLibs: [ await import('https://unpkg.com/php-wasm-sqlite') ]});
```

Supporting libraries should **not** be loaded via `ini`.

```javascript
const php = new PhpWeb({sharedLibs: [
	{
		name: `php8.4-sqlite.so`,
		url:  `https://unpkg.com/php-wasm-sqlite/php8.4-sqlite.so`,
		ini:  true,
	},
	{	
		name: 'sqlite.so',
		url: 'https://unpkg.com/php-wasm-sqlite/sqlite.so',
		ini: false 
	}
]});
```

Strings starting with `/`, `./`, `http://` or `https://` will be treated as URLs:

```javascript
const php = new PhpWeb({sharedLibs: [
	`./php8.4-phar.so`
]});
```

Some extensions require supporting libraries. You can provide URLs for those as `sharedLibs` as well, just pass `ini: false`:

*(`name` is implied to be the last section of the URL here.)*

```javascript
const php = new PhpWeb({sharedLibs: [
	{ url: 'https://unpkg.com/php-wasm-sqlite/php8.4-sqlite.so', ini: true  },
	{ url: 'https://unpkg.com/php-wasm-sqlite/sqlite.so',        ini: false },
]});
```

## Extension List

The following extensions may be loaded at runtime. This allows the shared extensions and their dependencies to be cached, reused, and selected à la carte for each application

### gd

[https://www.npmjs.com/package/php-wasm-gd](https://www.npmjs.com/package/php-wasm-gd)

### iconv

[https://www.npmjs.com/package/php-wasm-iconv](https://www.npmjs.com/package/php-wasm-iconv)

### intl

[https://www.npmjs.com/package/php-wasm-intl](https://www.npmjs.com/package/php-wasm-intl)

### libxml

[https://www.npmjs.com/package/php-wasm-libxml](https://www.npmjs.com/package/php-wasm-libxml)

### xml

[https://www.npmjs.com/package/php-wasm-xml](https://www.npmjs.com/package/php-wasm-xml)

### dom

[https://www.npmjs.com/package/php-wasm-dom](https://www.npmjs.com/package/php-wasm-dom)

### simplexml

[https://www.npmjs.com/package/php-wasm-simplexml](https://www.npmjs.com/package/php-wasm-simplexml)

### yaml

[https://www.npmjs.com/package/php-wasm-yaml](https://www.npmjs.com/package/php-wasm-yaml)

### zip

[https://www.npmjs.com/package/php-wasm-libzip](https://www.npmjs.com/package/php-wasm-libzip)

### mbstring

[https://www.npmjs.com/package/php-wasm-mbstring](https://www.npmjs.com/package/php-wasm-mbstring)

### openssl

[https://www.npmjs.com/package/php-wasm-openssl](https://www.npmjs.com/package/php-wasm-openssl)

### phar

[https://www.npmjs.com/package/php-wasm-phar](https://www.npmjs.com/package/php-wasm-phar)

### sqlite

[https://www.npmjs.com/package/php-wasm-sqlite](https://www.npmjs.com/package/php-wasm-sqlite)

### pdo-sqlite

[https://www.npmjs.com/package/php-wasm-sqlite](https://www.npmjs.com/package/php-wasm-sqlite)

### tidy

[https://www.npmjs.com/package/php-wasm-tidy](https://www.npmjs.com/package/php-wasm-tidy)

### sdl

Built into the `_sdl` runtime variant. No separate extension package is required.

### zlib

[https://www.npmjs.com/package/php-wasm-zlib](https://www.npmjs.com/package/php-wasm-zlib)
