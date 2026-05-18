---
title: php.ini
weight: -850
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/getting-started/php.ini.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpBase.mjs
-->
# php.ini

The php.ini files in php-wasm work exactly the same as in normal php. See the [PHP docs](https://www.php.net/manual/en/ini.list.php) for the full list of ini settings.

```ini
[php]
date.timezone=UTC
tidy.clean_output=1
expose_php=0
```

## Setting up php.ini at Runtime

You can pass in the `ini` property to the constructor to add lines to `/php.ini`:

```javascript
const php = new PhpWeb({ini: `
	date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
	tidy.clean_output=1
	expose_php=0
`});
```

## FS Locations

If present, The `/config/php.ini` and `/preload/php.ini` files will also be loaded. You can learn how to populate the filesystem in [Loading Files](/filesystem/loading-files.html).

## Loading Extensions by PHP Version

PHP allows for `${ENVIRONMENT_VARIABLES}` to be used inside ini files. The `PHP_VERSION` environment variable is provided to allow loading of the extension compatible with the currently running version of PHP.

```ini
[php]
extension=php${PHP_VERSION}-phar.so
```

Remember to correctly escape the `$` if you're supplying the INI from Javascript with `՝backtics՝`.

```{ .javascript highlight="2" }
const php = new PhpWeb({ini: `
	extension=php\${PHP_VERSION}-phar.so
	date.timezone=${Intl.DateTimeFormat().resolvedOptions().timeZone}
`});
```

## CGI Configuration

When running in CGI mode, php will look for a `php.ini` file in the document root directory, and load it along with the files listed above.

