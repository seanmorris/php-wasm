---
pagetitle: Custom Builds with php-wasm-builder
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/compiling/custom-builds.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/bin/php-wasm-builder.js
-->
# Custom Builds with php-wasm-builder

The `php-wasm-builder` *package* is the set of source files needed to build php-wasm & php-cgi-wasm.

The `php-wasm-builder` *command* is a wrapper script for the build process that allows the user to easily configure the underlying build process & drop the build assets wherever is necessary.

You can use [.php-wasm-rc](/compiling/php-wasm-rc.html) to customize your build.

## Installing php-wasm-builder

Install `php-wasm-builder` globally:

***Requires:***

* Docker
* Docker Compose
* Coreutils
* Wget
* Make

```sh
$ npm install -g php-wasm-builder
```

Create the build environment (can be run from anywhere):

```sh
$ php-wasm-builder image
```

Clean up files from a previous build

(Usually needed if the PHP version changes or Emscripten ABI changes have occurred)

```sh
$ php-wasm-builder clean
```

## php-wasm-builder commands

### build

Use this to build custom version of php-wasm. It's recommended to build this to an empty directory using a `.php-wasm-rc` file.

```bash
npx php-wasm-builder build
```

### image

This will build the docker container used to build php-wasm.

```bash
npx php-wasm-builder image
```

### copy-assets

This will scan the current package's node_modules directory for shared libraries & supporting files, and copy them to `PHP_ASSET_DIR`.

You can use this with `.php-wasm-rc` to copy assets even if you're not using a custom build.

```bash
npx php-wasm-builder copy-assets
```

### build-assets

While `copy-assets` moves existing shared libraries, the `build-assets` command compiles them first, then moves them to PHP_ASSET_DIR.

You can use this with `.php-wasm-rc` to copy assets even if you're not using a custom build.

```bash
npx php-wasm-builder build-assets
```

### clean

Clear cached build resources.

```bash
npx php-wasm-builder clean
```

### deep-clean

Clear out all downloaded dependencies and start from scratch.

```bash
npx php-wasm-builder deep-clean
```

### help

Print the help text for a given command

```bash
npx php-wasm-builder help COMMAND
```


## Build for web

Then navigate to the directory you want the files to be built in, and run `php-wasm-builder build`

```sh
$ cd ~/my-project
$ php-wasm-builder build
# "web" is the default:
# php-wasm-builder build web
```

## Build for node

```sh
$ cd ~/my-project
$ php-wasm-builder build node
```

## ESM Modules:

Build ESM modules with:

```sh
$ php-wasm-builder build web mjs
$ php-wasm-builder build node mjs
```

The current builder script defaults to `js` output unless you pass `mjs`.

## CGI Modules:

Build CGI modules with:

```sh
$ php-wasm-builder build web cgi mjs
$ php-wasm-builder build node cgi mjs
$ php-wasm-builder build worker cgi mjs
```
## PHP_DIST_DIR

This will build the package inside of the current directory (or in `PHP_DIST_DIR`, *see [.php-wasm-rc](/compiling/php-wasm-rc.html) for more info.*)
