# php-wasm-sdl

`php-wasm-sdl` is a compatibility shim for SDL-enabled `php-wasm` runtimes.

## Install

```sh
npm install php-wasm
```

## What It Does

SDL support now lives entirely in the `_sdl` runtime variant.
There is no separate `php8.x-sdl.so` payload to load at runtime.

Existing code that imports `php-wasm-sdl` still works, but the package now resolves to an empty shared-library list.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';

const php = new PhpWeb({
  version: '8.4',
  variant: '_sdl',
});

await php.run(`<?php var_dump(function_exists('SDL_Init'));`);
```

## Custom Builds

Enable `WITH_SDL` in `.php-wasm-rc`.

## Build Options

- `WITH_SDL`: defaults to `0`.
- `WITH_SDL=1` enables the `_sdl` runtime variant and compiles `ext-sdl` into that runtime.
- `WITH_SDL=dynamic` remains accepted as a legacy alias for `1`.
- Enabling SDL appends `_sdl` to `PHP_VARIANT` in the SDL-specific build rules.
