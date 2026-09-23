---
pagetitle: Custom Builds with php-wasm-builder
---
<!--
Vendored from php-wasm-site commit 726c62268967ef5a409a9a6f229fd42468dac489
Source: https://github.com/seanmorris/php-wasm-site/blob/726c62268967ef5a409a9a6f229fd42468dac489/pages/compiling/custom-builds.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/bin/php-wasm-builder.js
-->
# Custom Builds with php-wasm-builder

The `php-wasm-builder` *package* contains the source files needed to build
php-wasm, php-cgi-wasm, php-cli-wasm, php-dbg-wasm, php-cloud-wasm, and php-sdl-wasm.

The `php-wasm-builder` *command* is a wrapper script for the build process that allows the user to easily configure the underlying build process & drop the build assets wherever is necessary.

You can use [.php-wasm-rc](/compiling/php-wasm-rc.html) to customize your build.

## Installing php-wasm-builder

Install `php-wasm-builder` globally:

***Requires:***

* Docker
* Docker Compose v2 (`docker compose`)
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

Use this to build a custom runtime package. Build into an empty directory using
a `.php-wasm-rc` file to select its configuration.

```bash
npx php-wasm-builder build
```

The optional selectors can be provided in any order:

| Selector | Values | Default |
| --- | --- | --- |
| Environment | `web`, `node`, `worker`, `webview`, `cloudflare`, `sdl` | `web` |
| Module format | `js`, `mjs` | `js` |
| Package | `base`, `cgi`, `cli`, `dbg` | `base` |

`base`, `cgi`, `cli`, and `dbg` build `php-wasm`, `php-cgi-wasm`,
`php-cli-wasm`, and `php-dbg-wasm`, respectively. Unknown or conflicting
selectors fail before Make starts.

The `cloudflare` and `sdl` environments build standalone `php-cloud-wasm` and
`php-sdl-wasm` packages. They support only embedded PHP (`base`) and ESM (`mjs`),
which are selected by default for these two environments.

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

Worker and webview targets use the same selector format:

```sh
$ php-wasm-builder build worker mjs
$ php-wasm-builder build webview mjs
```

## ESM Modules

Build ESM modules with:

```sh
$ php-wasm-builder build web mjs
$ php-wasm-builder build node mjs
```

The ordinary runtime targets default to `js` output unless you pass `mjs`.
The `sdl` and `cloudflare` targets produce ESM only and default to `mjs`.

## CGI Modules

Build CGI modules with:

```sh
$ php-wasm-builder build web cgi mjs
$ php-wasm-builder build node cgi mjs
$ php-wasm-builder build worker cgi mjs
```

## CLI Modules

Build `php-cli-wasm` modules with:

```sh
$ php-wasm-builder build node cli mjs
$ php-wasm-builder build web cli mjs
```

## DBG Modules

Build `php-dbg-wasm` modules with:

```sh
$ php-wasm-builder build node dbg mjs
$ php-wasm-builder build web dbg mjs
```

## SDL browser runtime

Build the standalone [php-sdl-wasm runtime](/extensions/sdl.html) with a builder
containing this development package:

```sh
php-wasm-builder build sdl mjs
```

This uses the normal Make build and writes the finished package to
`packages/php-sdl-wasm` in your project. Select the PHP version and add-on flags
in `.php-wasm-rc`. SDL_image, SDL_mixer, SDL_ttf, and OpenGL default to enabled;
each can be disabled independently with the
[SDL runtime options](/compiling/php-wasm-rc.html#sdl-runtime-options).

In a source checkout, use `make sdl-mjs`. It packages the matching JavaScript,
Wasm, preload data, and required native libraries together. Use `PhpSdl` from a
versioned entry such as `php-sdl-wasm/php8.4-sdl.mjs`; neither runtime package
depends on the other. Keep all generated package files together.

## PHP_DIST_DIR

Ordinary runtime targets build inside the current directory, or in
`PHP_DIST_DIR`; see [.php-wasm-rc](/compiling/php-wasm-rc.html) for details.
The `sdl` target writes its complete package to `packages/php-sdl-wasm` as
described above.
