---
title: Using PHP Extensions
weight: -1000
---
<!--
Vendored from php-wasm-site working tree based on commit 30bc147c87d58caf7c40bdaa36f1288188d56c91
Source: https://github.com/seanmorris/php-wasm-site/blob/30bc147c87d58caf7c40bdaa36f1288188d56c91/pages/extensions/using-php-extensions.md
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

Versioned extension filenames must match the active runtime version. If you switch away from the default `8.4` runtime, update `php8.4-*.so` examples accordingly.

Shared builds work a little differently from dynamic ones. In `shared` builds, many common extensions are already compiled into the base runtime, so only third-party support libraries should be injected at startup. For example, `intl` in shared mode still needs the ICU `libicu*.so` files and `icudt72l.dat`, but it should not try to load `php8.x-intl.so` a second time. Shared `intl` should get the data file the same way dynamic builds do: preload `icudt72l.dat` into `/preload` at startup.

The same distinction applies to SSL/TLS support. In static and shared runtime variants, OpenSSL support and its backing libraries may already be linked into the base runtime, while dynamic builds still rely on the `php-wasm-openssl` package and explicit support-library loading.

Static builds are the exception for `intl`: they can bundle `icudt72l.dat` directly into the runtime `.data` payload instead of fetching it separately.

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

### xmlwriter

[https://www.npmjs.com/package/php-wasm-xmlwriter](https://www.npmjs.com/package/php-wasm-xmlwriter)

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
