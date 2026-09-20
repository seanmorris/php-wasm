# php-wasm-sdl

The `_sdl` browser runtime includes SDL2, SDL_image, SDL_mixer, SDL_ttf and
OpenGL shader bindings. `php-wasm-sdl` preserves the historical import and its
empty `getLibs()` result. There are no separate SDL PHP side modules.

## Run the example

Open **SDL Cube** in the embedded PHP demo. It renders a perspective cube with
the existing sean-icon-32 texture and a TrueType text overlay. Click **Enable audio** to start
looping Ogg music and WAV effects. Focus the canvas to use arrows/WASD to rotate,
Space to pause rotation, R to reset, M to mute, and Escape to stop. Audio pauses
when focus leaves the canvas. Run restarts a stopped demo; Refresh releases its
native resources. The original **SDL Sine** example remains available.

The icon uses nearest-neighbor filtering without mipmaps, and the canvas uses
pixelated scaling to preserve its pixel art.

The cube needs WebGL2. Context loss pauses it; restoration recreates its shaders,
buffers and textures. Asset downloads have HTTP checks and a 30-second timeout;
missing or undecodable assets report an error instead of blocking startup.

## Use the runtime

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';

const php = new PhpWeb({
  version: '8.4',
  variant: '_sdl',
  canvas: document.querySelector('canvas'),
});
await php.run(`<?php var_dump(function_exists('SDL_Init'));`);
```

This minimal example applies to a static build. Builds with shared codecs must
also supply the matching `libpng.so`, `libjpeg.so`, `libfreetype.so` and `libz.so`
through `sharedLibs`/`locateFile`, as with other shared native dependencies.
Those artifacts come from the existing `php-wasm-gd` and `php-wasm-zlib`
packages; enabling the PHP GD/zlib extensions is not required. The embedded
demo supplies these codecs even when its extension toggles are all disabled.
Always ship JavaScript and Wasm from the same build, with matching codec assets.

## Build with Make

```sh
make web-mjs WITH_SDL=1
# Keep just core SDL:
make web-mjs WITH_SDL=1 WITH_SDL_IMAGE=0 WITH_SDL_MIXER=0 WITH_SDL_TTF=0 WITH_OPENGL=0
```

| Option | Default | Behavior |
| --- | --- | --- |
| `WITH_SDL` | `0` | `1` enables `_sdl`; `dynamic` is a legacy alias for `1` |
| `WITH_SDL_IMAGE` | follows SDL | PECL sdl_image 0.4.0 / SDL_image 2.6.0; PNG, JPEG, BMP |
| `WITH_SDL_MIXER` | follows SDL | PECL sdl_mixer 0.4.0 / SDL_mixer 2.8.0; WAV and Ogg Vorbis |
| `WITH_SDL_TTF` | follows SDL | PECL sdl_ttf 0.3.0 / SDL_ttf 2.20.2; FreeType, without HarfBuzz |
| `WITH_OPENGL` | follows SDL | PECL opengl 0.9.0 with the PHP 8 browser shader implementation |

Add-on flags accept `0` or `1` and require SDL. Changing them invalidates PHP's
configure step. SDL_image requires enabled `WITH_LIBPNG` and `WITH_LIBJPEG`;
SDL_ttf requires `WITH_FREETYPE`. Their static/shared settings select the same
codec artifacts used by GD. Disabling the PHP zlib extension with `WITH_ZLIB=0`
still supplies the native zlib archive needed for image/font decoding.

Sources are pinned, downloaded, patched and compiled by `static.mak` and
`extensions.mak` through the existing Docker builder. The SDL version in
`sdl2-config` is read from the installed headers. No Emscripten ports are silently
selected in addition to the existing codec libraries.

## PHP APIs and ownership

Use SDL functions for windows, contexts and input. `IMG_Load()` returns an
`SDL_Surface` or null. `TTF_OpenFont()` and the text-rendering functions return
null on native load/render failures. Inspect `SDL_GetError()` for details.
Close fonts with `TTF_CloseFont()` and free surfaces with `SDL_FreeSurface()`.

`Mix_LoadWAV()` returns a `Mix_Chunk`; `Mix_LoadMUS()` returns a `Mix_Music`.
Failed loads return null. `Mix_GetChunk()` returns the same object as the
original chunk. Freeing it invalidates every alias; repeated frees are harmless,
and using a freed object raises an Error. Native audio objects stay alive while
the mixer may reference them, and request shutdown halts playback and frees
remaining objects. Explicitly free resources in long-running animation loops.

The RWops loaders honor `freesrc=1` by closing through the PHP SDL wrapper.
Streamed music owns a snapshot of the remaining seekable input, so the caller
may close or release its RWops after loading. This copy is retained until the
music is freed. `Mix_Init()` reports the codecs actually available; this build
does not enable MP3, FLAC, MIDI or tracker decoders.

Register browser animation cleanup in `vrzno_env('onRefresh')` so callbacks,
listeners and native resources are released before PHP request memory resets.
The cube demonstrates idempotent cleanup on rerun, refresh, errors and page exit.
SDL initialization disables implicit Asyncify sleeps during buffer swaps, including
after `SDL_Quit()`. Animation callbacks stay synchronous; use the browser's
`requestAnimationFrame` to schedule frames, as in both examples.

## OpenGL shader API

The browser implementation replaces the old desktop translation unit. It offers
shader compilation/link diagnostics, programs, uniforms, vertex/index buffers,
vertex arrays, textures, framebuffers, render state, drawing and pixel readback.
See [php_webgl.stub.php](opengl/php_webgl.stub.php) for the complete supported API.
Desktop immediate-mode functions and unimplemented desktop stubs are omitted.

Create and make current an SDL OpenGL ES 3 context before using these bindings.
GL driver errors are available through `glGetError()`. Invalid PHP buffer sizes,
unsafe pixel layouts and invalid offsets raise exceptions before native access.

- `glBufferData()`/`glBufferSubData()` accept packed byte strings (`pack('g*',
  ...$floats)` for little-endian float32); null allocates an empty buffer.
- `glVertexAttribPointer()` takes a byte offset in the bound vertex buffer.
  `glDrawElements()` takes a checked, aligned offset in a bound index buffer.
- `glTexImage2D()` and `glTexSubImage2D()` accept checked pixel bytes or a live
  `SDL_Surface`. Surface dimensions must match and the format/type must be
  `GL_RGBA`/`GL_UNSIGNED_BYTE`; conversion happens natively. Only image allocation
  accepts null. Row padding follows PACK/UNPACK_ALIGNMENT. Pixel buffer objects
  and nonzero pixel-store row/skip settings are rejected by these upload APIs.
- `glUniformMatrix4fv()` takes exactly `count * 16` finite numbers, column-major,
  with transpose false. `glShaderSource()` takes one string (`count=1`).
- Generation functions fill PHP arrays by reference. Delete functions require
  exactly the declared number of unsigned handles. Delete GL resources before
  destroying their owning context.
- `glGetIntegerv()` returns a scalar for supported binding, alignment and limit
  selectors. It rejects selectors that would write arrays into scalar storage.

These signatures correct unsafe or empty behavior in the upstream desktop
binding; code written against those old signatures may need adjustment.

To regenerate PHP 8.0-compatible arginfo after an API change:

```sh
php third_party/php8.0-src/build/gen_stub.php packages/sdl/opengl/php_webgl.stub.php
```

The Make/configuration tests run with `node --test test/build/sdl.test.mjs`.
Run browser tests against the normal browser harness server:

```sh
PHP_VERSION=8.4 PHP_VARIANT=_sdl LIB_TYPE=static npm run test:browser -- test/browser/sdl.spec.mjs
```

CI builds and checks SDL artifacts for PHP 8.0–8.5 under the three existing
library profiles.

## Build measurements

Measured on 2026-09-20 with PHP 8.4.1, the static CI profile and Emscripten
6.0.6. The baseline is the core SDL runtime at `eca81a6`; the expanded build
includes the extensions and callback fixes described above. Sizes combine
the JavaScript and Wasm files, in bytes:

| Encoding | Core SDL | Expanded SDL | Increase |
| --- | ---: | ---: | ---: |
| Raw | 50,942,530 | 51,499,398 | 556,868 (1.09%) |
| gzip, level 9 | 13,802,830 | 13,922,591 | 119,761 (0.87%) |
| Brotli, quality 11 | 9,314,484 | 9,508,327 | 193,843 (2.08%) |

The separate 30,873,664-byte ICU data file is unchanged. The cube's font and
audio assets add 362,265 raw bytes; its texture reuses the existing icon.

Three fresh Chromium 152 processes, serving uncompressed files over localhost
on an i7-7700K with SwiftShader, produced these median timings. Native builds
and compression had finished before timing began.

| Measurement | Core SDL | Expanded SDL |
| --- | ---: | ---: |
| Runtime ready | 815 ms | 850 ms |
| First PHP execution complete | 837 ms | 867 ms |
| Cube assets fetched and staged | — | 11 ms |
| Cube start to first frame, after assets | — | 579 ms |

The cube averaged 55–59 FPS across the three 180-frame samples, with 16.7 ms
median and p95 frame intervals. These are local software-rendering measurements;
the small startup sample is not a performance guarantee. Per-file sizes, hashes
and individual timing samples are in [the measurement record](benchmarks/2026-09-20.json).
