---
title: .php-wasm-rc
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/compiling/php-wasm-rc.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/Makefile
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/.github/.env_8.5.shared.ci
-->
# .php-wasm-rc

The `.php-wasm-rc` file is a configuration file that allows you to specify custom build options for php-wasm. When placed in the same directory as your project, the `php-wasm-builder` tool will use it to customize the build process.

Example `.php-wasm-rc` file:

```make
# Select a PHP version
PHP_VERSION=8.4

# Build the package to a directory other than the current one (RELATIVE path)
PHP_DIST_DIR=./public

# Build the extensions to a directory other than the current one (RELATIVE path)
PHP_ASSET_DIR=./public


# Build the cgi package to a directory other than the current one (RELATIVE path)
PHP_CGI_DIST_DIR=./public

# Build the cgi package's extensions to a directory other than the current one (RELATIVE path)
PHP_CGI_ASSET_DIR=./public

# Space separated list of files/directories (ABSOLUTE paths)
# to be included under the /preload directory in the final build.
PRELOAD_ASSETS=~/path/to/file/php-scripts ~/other-dir/example.php

# Memory to start the instance with, before growth
INITIAL_MEMORY=2048MB

# Build with assertions enabled
ASSERTIONS=0

# Select the optimization level
OPTIMIZE=3

# Build with extensions
WITH_GD=1
WITH_LIBPNG=1
WITH_LIBJPEG=1
WITH_FREETYPE=1
```

## Options

The following options may appear in `.php-wasm-rc`.

### PRELOAD_ASSETS

Use the `PRELOAD_ASSETS` key in your `.php-wasm-rc` file to define a list of files and directories to include by default.

The files and directories will be collected into a single directory. Individual files & directories will appear in the top level, while directories will maintain their internal structure.

These files & directories will be available under `/preload` in the final package, packaged into the `.data` file that is built along with the `.wasm` file.

```bash
PRELOAD_ASSETS='/path/to/file.txt /some/directory /path/to/other_file.txt /some/other/directory'
```

### PHP_VERSION

8.0|8.1|8.2|8.3|8.4|8.5

---

### PHP_DIST_DIR

This is the directory where javascript & wasm files will be built to, *relative to the current directory.*

---

### PHP_ASSET_DIR

This is the directory where shared libs, extension, `.data` files & other supporting files will be built to, *relative to the current directory.* Defaults to `PHP_DIST_DIR`.

---

### OPTIMIZE

0|1|2|**3**

The optimization level to use while compiling.

---

### SUBOPTIMIZE

The optimization level to use while compiling libraries. Defaults to `OPTIMIZE`.

---

### ASSERTIONS

0|**1**

Build with/without assertions.

---

## Extension Flags

Extensions may be compiled as `dynamic`, `shared`, or `static`.

* dynamic - these extensions may be loaded selectively at runtime.
* shared - these extensions will always be loaded at startup and can be cached and reused.
* static - these extensions will be built directly into the main wasm binary (may cause a huge filesize).

(defaults provided below in **bold**)

The following options are available for building static PHP extensions:

```
WITH_BCMATH    # [0, 1] Enabled by default
WITH_CALENDAR  # [0, 1] Enabled by default
WITH_CTYPE     # [0, 1] Enabled by default
WITH_EXIF      # [0, 1] Enabled by default
WITH_FILTER    # [0, 1] Enabled by default
WITH_TOKENIZER # [0, 1] Enabled by default
WITH_VRZNO     # [0, 1] Enabled by default
```

The following extension may be compiled as static, shared or dynamic:

```
WITH_PHAR      # [0, 1, static, dynamic]
WITH_LIBXML    # [0, 1, static, shared]
WITH_ICONV     # [0, 1, static, shared, dynamic]
WITH_SQLITE    # [0, 1, static, shared, dynamic]

WITH_LIBZIP    # [0, 1, static, shared, dynamic]
WITH_ZLIB      # [0, 1, static, shared, dynamic]

WITH_GD        # [0, 1, static, shared, dynamic]
WITH_LIBPNG    # [0, 1, static, shared]
WITH_FREETYPE  # [0, 1, static, shared]
WITH_LIBJPEG   # [0, 1, static, shared]

WITH_YAML      # [0, 1, static, shared, dynamic]
WITH_TIDY      # [0, 1, static, shared, dynamic]
WITH_MBSTRING  # [0, 1, static, dynamic]
WITH_ONIGURUMA # [0, 1, static, shared]
WITH_OPENSSL   # [0, 1, shared, dynamic]
WITH_INTL      # [0, 1, static, shared, dynamic]
```

---

### WITH_PHAR

static|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension file `php8.x-phar.so`.

---

### WITH_LIBXML

static|**shared**

This actual `php-libxml` extension must be statically compiled, but `libxml` itself may be loaded as a shared library.

When compiled as a `shared` library, it will produce the library `libxml.so`.

---

### WITH_LIBZIP

static|shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-zip.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the library `libzip.so`.

This extension depends on `zlib`.

---

### WITH_ICONV

static|shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-iconv.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the library `libiconv.so`.

---

### WITH_SQLITE

static|shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extensions `php8.x-sqlite.so`, & `php8.x-pdo-sqlite.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the library `libsqlite3.so`.

---

### WITH_GD

static|**dynamic**

If WITH_GD is set to dynamic, then libpng, libjpeg, and freetype will load after GD is loaded.

When compiled as a `dynamic` extension, this will produce the extension `php8.x-gd.so`.

---

### WITH_LIBPNG

static|**shared**

When compiled as a `shared` library, this will produce the library `libpng.so`.

If WITH_GD is dynamic, then loading will be deferred until after gd is loaded.

---

### WITH_FREETYPE

static|**shared**

When compiled as a `shared` library, this will produce the library `libfreetype.so`.

If WITH_GD is dynamic, then loading will be deferred until after gd is loaded.

---

### WITH_LIBJPEG

static|**shared**

When compiled as a `shared` library, this will produce the library `libjpeg.so`.

If WITH_GD is dynamic, then loading will be deferred until after gd is loaded.

---

### WITH_ZLIB

static|shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-zlib.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the library `libz.so`.

---

### WITH_YAML

static|shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-yaml.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the library `libyaml.so`.

---

### WITH_TIDY

static|shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-tidy.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the library `libtidy.so`.

---

### WITH_MBSTRING

static|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-mbstring.so`.

---

### WITH_ONIGURUMA

static|shared|**dynamic**

Support library for `mbstring`.

When compiled as a `dynamic` or `shared ` library, this will produce the library `libonig.so`.

If `WITH_MBSTRING` is `dynamic`, then loading will be deferred until after `mbstring` is loaded.

---

### WITH_OPENSSL

shared|**dynamic**

When compiled as a `dynamic` extension, this will produce the extension `php8.x-openssl.so`.

When compiled as a `dynamic` or `shared` extension, it will produce the libraries `libssl.so` &  `libcrypto.so`.

---

### WITH_INTL

static|shared|**dynamic**

When compiled as a `dynamic`, or `shared` extension, this will produce the extension `php8.x-intl.so` & the following libraries:

* libicuuc.so
* libicutu.so
* libicutest.so
* libicuio.so
* libicui18n.so
* libicudata.so
* icudt72l.dat
