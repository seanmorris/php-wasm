---
title: SDL and OpenGL
---
<!--
Vendored from php-wasm-site commit eec9df8786a76525f3a07eaf85e597b3e8e57ff9
Source: https://github.com/seanmorris/php-wasm-site/blob/eec9df8786a76525f3a07eaf85e597b3e8e57ff9/pages/extensions/sdl.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/test/browser/sdl.spec.mjs
- https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/test/build/sdl.test.mjs
-->
# SDL and OpenGL

The `_sdl` browser runtime includes SDL2, SDL_image, SDL_mixer, SDL_ttf, and
OpenGL shader bindings. It supports PHP 8.0–8.5 with static, shared, and dynamic
library profiles. The SDL PHP extensions are built into this runtime variant;
they are not separately loaded PHP side modules. The historical `php-wasm-sdl`
helper remains compatible and returns an empty library list.

The add-ons and cube described here are **unreleased development features**.
The [initial SDL expansion](https://github.com/seanmorris/php-wasm/commit/f4ae26b5676148f222be5dd65fc65259ba479d06)
adds the image, font, mixer, and shader APIs. The current cube also needs the
subsequent [MP3-enabled build](https://github.com/seanmorris/php-wasm/commit/d075a2c74dcacfd1344c46a8b5279ee917cf37b9). Use its source, assets, and native runtime from
the same checkout. Older published runtimes may provide only core SDL.

## Select the runtime and canvas

Create a canvas before constructing `PhpWeb`. This example assumes a bundler
and a static runtime build:

```html
<canvas id="sdl" width="640" height="480" tabindex="0"
    style="image-rendering: pixelated"></canvas>
```

```javascript
import {PhpWeb} from 'php-wasm/PhpWeb.mjs';

const php = new PhpWeb({
    version: '8.4',
    variant: '_sdl',
    canvas: document.querySelector('#sdl'),
});

php.addEventListener('output', event => console.log(...event.detail));
php.addEventListener('error', event => console.error(...event.detail));

await php.run(`<?php
    var_dump(function_exists('SDL_Init'), function_exists('glCreateShader'));
`);
```

Always serve the matching JavaScript and Wasm files from the same build, along
with its `.data` file when present. `PhpNode` does not select the `_sdl` variant.

Shared image/font codecs also need matching `libpng.so`, `libjpeg.so`,
`libfreetype.so`, and `libz.so` assets through `sharedLibs`/`locateFile`. These
support libraries come from `php-wasm-gd` and `php-wasm-zlib`; enabling the PHP
GD or zlib extensions is not required. Pass manually supplied support libraries
with `ini: false`. The embedded demo loads these dependencies even when its PHP
extension toggles are disabled.

## Run the textured cube

In a demo build containing the expansion, select **SDL Cube** in the embedded
PHP editor. It renders a rotating perspective cube using `sean-icon-32.png`, a
TrueType text overlay, looping MP3 music, and a WAV sound effect. The track is
**Unreal Superhero 3** by **Kenët and rez**, credited from the supplied
`WOJTEK3.mp3` ID3 tags. The texture
uses `GL_NEAREST` without mipmaps, and the canvas uses pixelated scaling.
**SDL Sine** remains available as the smaller original example.

The cube canvas fills the editor's preview box. It updates its drawing buffer,
viewport, perspective, and text overlay when the box changes size, preserving
the cube's proportions in landscape and portrait layouts. Cleanup disconnects
its resize observer.

The editor stores PHP source in the URL's `#code=` fragment. Copy the complete
URL to share or reload edited code. Runtime settings stay in the query string;
the source is encoded once and is not sent in HTTP requests. Existing `?code=`
links remain supported and migrate to the fragment. The full link can still be
long, but it no longer consumes the server's request-header limit.

The cube requires WebGL2. Click **Enable audio** to satisfy the browser's user
gesture requirement, then focus the canvas for keyboard input:

| Control | Action |
| --- | --- |
| Arrows / WASD | Rotate the cube |
| Space | Pause or resume rotation |
| R | Reset rotation |
| M | Mute or resume enabled audio |
| Escape | Stop the demo |

Audio pauses when focus leaves the canvas. **Run** restarts a stopped demo;
**Refresh** releases its native resources. Graphics context loss pauses
rendering, and restoration rebuilds the GL resources.

For your own page, use [sdl-cube.php](https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/demo-web/public/scripts/sdl-cube.php)
and its [asset loader](https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/demo-web/src/lib/sdlAssets.js)
from the same checkout as your runtime.
Before running the cube, stage these files under `/preload/sdl` in PHP's virtual
filesystem:

| File | Source in the php-wasm checkout |
| --- | --- |
| `sean-icon-32.png` | `demo-web/src/assets/icons/sean-icon-32.png` |
| `DejaVuSansMono.ttf` | `demo-web/public/sdl/DejaVuSansMono.ttf` |
| `WOJTEK3.mp3` | `demo-web/public/sdl/WOJTEK3.mp3` |
| `click.wav` | `demo-web/public/sdl/click.wav` |

The asset loader also retains `loop.ogg` for code saved in older shared cube links.

The demo fetches all assets with HTTP and empty-body checks and a 30-second
timeout, then writes them into the idle runtime's filesystem. A failed fetch
reports its filename and can be retried with **Run**. A native audio decode
failure presents **Retry audio** while rendering continues. Preserve the
font/audio notices in `demo-web/public/sdl/LICENSE.txt` when copying assets.

## Build options

Use the existing Make targets in the php-wasm checkout:

```sh
make web-mjs WITH_SDL=1

# Keep only core SDL:
make web-mjs WITH_SDL=1 \
    WITH_SDL_IMAGE=0 WITH_SDL_MIXER=0 \
    WITH_SDL_TTF=0 WITH_OPENGL=0
```

The same flags can be set in [`.php-wasm-rc`](/compiling/php-wasm-rc.html#sdl-runtime-options)
for `php-wasm-builder build web mjs` from a builder containing this expansion.

| Flag | Default | Included support |
| --- | --- | --- |
| `WITH_SDL` | `0` | `1` selects `_sdl`; `dynamic` is a legacy alias for `1` |
| `WITH_SDL_IMAGE` | Follows SDL | PECL sdl_image 0.4.0 / SDL_image 2.6.0; PNG, JPEG, BMP |
| `WITH_SDL_MIXER` | Follows SDL | PECL sdl_mixer 0.4.0 / SDL_mixer 2.8.0; WAV, Ogg Vorbis, MP3 |
| `WITH_SDL_TTF` | Follows SDL | PECL sdl_ttf 0.3.0 / SDL_ttf 2.20.2; FreeType without HarfBuzz |
| `WITH_OPENGL` | Follows SDL | PECL opengl 0.9.0 with PHP 8 browser shader bindings |

Add-on flags accept `0` or `1` and require SDL. SDL_image requires enabled
`WITH_LIBPNG` and `WITH_LIBJPEG`; SDL_ttf requires `WITH_FREETYPE`. Select
`static` or `shared` for those codec libraries using the existing build flags.
`WITH_ZLIB=0` disables the PHP extension while retaining the native zlib archive
needed by image/font decoding. The build reuses these codec providers without
adding duplicate Emscripten ports. MP3 uses SDL_mixer's bundled `minimp3` decoder,
without another shared library. FLAC, MIDI, tracker decoders, and HarfBuzz are
not enabled by this profile.

## Graphics APIs and cleanup

Create an SDL OpenGL ES 3 context before calling the GL bindings. The browser
API supports shaders, programs, uniforms, buffers, vertex arrays, textures,
framebuffers, drawing, and pixel readback. Desktop immediate-mode functions such
as `glBegin()` are not provided. Use the [supported PHP signatures](https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/packages/sdl/opengl/php_webgl.stub.php)
and [buffer, texture, and matrix rules](https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/packages/sdl/README.md#opengl-shader-api)
when porting desktop code. Invalid sizes and offsets raise exceptions before
native memory access; GL driver errors are available through `glGetError()`.

Image, font, and audio loaders return `null` on native load failures. Check
`SDL_GetError()`. Free surfaces with `SDL_FreeSurface()`, close fonts with
`TTF_CloseFont()`, and release audio with `Mix_FreeChunk()` / `Mix_FreeMusic()`.
Freed audio/font objects cannot be reused. Delete GL resources before destroying
their context.

After halting playback and freeing music/chunks, call `Mix_CloseAudio()` and
`Mix_Quit()` to close the device and unload initialized decoders. The cube also
performs this cleanup when audio setup fails, before offering a retry.

Schedule frames with the browser's `requestAnimationFrame`. SDL buffer swaps
stay synchronous inside Vrzno animation callbacks. Register idempotent cleanup
in `vrzno_env('onRefresh')` to cancel frames, remove listeners, stop audio, and
release native resources before PHP request memory resets. The cube also cleans
up on rerun, errors, and page exit. Use a fresh canvas when replacing a runtime
or switching graphics context types.

## Size and test coverage

The initial PHP 8.4.1 static measurement, before MP3 support, adds 119,761 gzip
bytes (0.87%) to the combined JavaScript/Wasm payload compared with core SDL.
Its ICU data is unchanged. The current demo preloads 3,425,884 raw bytes of
font/audio assets, including the original Ogg for older shared links; the icon
is reused. See the
[measurement record](https://github.com/seanmorris/php-wasm/blob/f4ae26b5676148f222be5dd65fc65259ba479d06/packages/sdl/benchmarks/2026-09-20.json)
for the build configuration, individual sizes, and local startup/frame timings.

The MP3 follow-up adds another 56,876 raw bytes, 24,688 gzip bytes, or 24,473
Brotli bytes to that runtime. MP3 decoding uses the bundled minimp3 implementation;
the original 3,063,619-byte track is a separate demo asset. The older Ogg remains
available to shared links saved before the music change.

Three interleaved local startup comparisons measured median runtime readiness
at 946 ms before MP3 and 927 ms after, with no demonstrated startup regression
in this small sample. Three 180-frame samples with MP3 playing averaged
58.4–59.7 FPS at 640×400 under Chromium 152 and SwiftShader. The full follow-up
record is [available in the source checkout](https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/packages/sdl/benchmarks/2026-09-21-mp3.json).

CI covers PHP 8.0–8.5 with all three library profiles. Browser tests exercise
textured rendering, text, keyboard input, nonzero audio output after a gesture,
rerun/refresh cleanup, context restoration, and checked native bindings.
