# php-wasm-sdl

The `_sdl` browser runtime includes SDL2, SDL_image, SDL_mixer, SDL_ttf and
OpenGL shader bindings. `php-wasm-sdl` preserves the historical import and its
empty `getLibs()` result. There are no separate SDL PHP side modules.

## Run the example

Open **SDL Cube** in the embedded PHP demo. It renders a perspective cube with
the existing sean-icon-32 texture and a TrueType text scroller. Four messages
stream in from left to right, with a sine wave through the individual letters,
then leave to the right. The bold text uses a cyan/white/sand gradient and black
outline over the spinning cube. Edit the example's `MESSAGES` array to change
the text; long messages wrap to fit the canvas. Glyphs, gradient and outline
are baked into one cached texture atlas. `SPIN_SPEED` and `KEYBOARD_SPEED`
control automatic and manual rotation. Click **Enable audio** to start
looping MP3 music and WAV effects. The track is **Unreal Superhero 3** by
**Kenët and rez**, credited from the supplied `WOJTEK3.mp3` ID3 tags.
Focus the canvas to use arrows/WASD to rotate,
Space to pause rotation and text, R to reset both, M to mute, and Escape to stop. Audio pauses
when focus leaves the canvas. Run restarts a stopped demo; Refresh releases its
native resources. The original **SDL Sine** example remains available.

Use the example, asset loader and MP3-enabled runtime from the same checkout;
the initial SDL expansion supported only WAV and Ogg.

The icon uses nearest-neighbor filtering without mipmaps, and the canvas uses
pixelated scaling to preserve its pixel art.

The cube canvas fills its preview box. Resizing updates the drawing buffer,
viewport, perspective and text overlay; both landscape and portrait layouts
keep the cube's proportions. The resize observer is released during cleanup.

Running or loading a demo stores its PHP source in the URL's `#code=` fragment.
Copy the full URL to share it. The source is encoded once and stays out of HTTP
requests; runtime options remain in the query string. Existing `?code=` links
still load and are migrated to the fragment. Large snippets still produce long
share links, but no longer consume the server's request-header limit.

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
| `WITH_SDL_MIXER` | follows SDL | PECL sdl_mixer 0.4.0 / SDL_mixer 2.8.0; WAV, Ogg Vorbis and MP3 |
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

PHP configure caches are separated by full PHP version and effective configure
arguments under `.cache/php-configure/`. Changing add-on flags reconfigures PHP;
repeating the same settings preserves the configuration timestamp. `make
php-clean` removes the selected PHP version's caches, and `make clean` removes
all configure caches. Switching PHP versions does not require editing cached
iconv results.

The browser integration files in `js/` are Emscripten link inputs. Editing one
relinks the selected runtime without rerunning PHP configure or recompiling
unchanged C sources. Use the ordinary Make target and keep its JS/Wasm output
pair together.

After building, verify incremental behavior with:

```sh
ENV_FILE=.github/.env_8.4.static.ci node .github/bin/verify-sdl-incremental.mjs 8.4
```

Use the same `ENV_FILE` as the build. The verifier requires an unchanged build
to preserve both native objects and output timestamps, then uses Make's `-W`
option to simulate an updated JS library and require a relink with no C changes.
CI runs this check in the PHP 8.4 static job. The recorded configuration and
incremental checks are in `benchmarks/2026-09-22-make-conformance.json`;
`benchmarks/2026-09-22-make.json` records the matching artifact sizes and hashes.

## PHP APIs and ownership

Use SDL functions for windows, contexts and input. `IMG_Load()` returns an
`SDL_Surface` or null. `TTF_OpenFont()` and the text-rendering functions return
null on native load/render failures. Inspect `SDL_GetError()` for details.
Close fonts with `TTF_CloseFont()` and free surfaces with `SDL_FreeSurface()`.

`Mix_LoadWAV()` returns a `Mix_Chunk`; `Mix_LoadMUS()` returns a `Mix_Music`.
Failed loads return null. `Mix_GetChunk()` returns the same object as the
original chunk. Freeing it invalidates every alias; repeated frees are harmless,
and using a freed object raises an Error. Unused objects release on last PHP
reference; channels and active music keep playback alive. Final audio shutdown
invalidates remaining objects. See the ownership details below for channel
completion, fades and balanced device opens.

The RWops loaders honor `freesrc=1` by closing through the PHP SDL wrapper.
Streamed music owns a snapshot of the remaining seekable input, so the caller
may close or release its RWops after loading. This copy is retained until the
music is freed. `Mix_Init()` reports the codecs actually available. MP3 uses
SDL_mixer's bundled `minimp3` decoder, without an extra shared library. This
build does not enable FLAC, MIDI or tracker decoders.

RWops created by `SDL_RWFromFile()`, `SDL_RWFromConstMem()`,
`SDL_RWFromMem()` or `SDL_RWFromFP()` own their wrapper storage. `Close()` and
`Free()` release it once; later I/O raises a catchable Error. Raw `new SDL_RWops`
and `SDL_AllocRW()` objects can be freed safely, but cannot perform I/O without
callbacks. Native wrappers cannot be cloned, serialized or reinitialized.

`SDL_RWFromMem(&$buffer, $capacity)` requires a string and positive capacity.
It preserves the existing prefix, pads with zero bytes or truncates to capacity,
and updates that referenced string after writes. Ordinary string copies remain
unchanged. Keep the referenced value a string of the same length while using
the stream; edits to its bytes become visible on the next RWops operation.
`SDL_RWFromConstMem()` owns a read-only copy. Capacities and transfer lengths
must fit int32; invalid ranges raise ValueError instead of silently truncating.

`SDL_RWFromFP($stream, $autoclose = false)` retains a PHP stream resource and
supports file, `php://memory`, `php://temp` and custom PHP streams. Closing the
RWops closes the underlying resource only with `autoclose=true`; an external
`fclose()` invalidates subsequent I/O. Stream callbacks cannot recursively use
or close the active RWops. PHP callback exceptions propagate to the caller.
Close custom streams explicitly when their wrapper objects form resource cycles.

`Read(&$output, $bytes)` and `Write($input, $bytes)` transfer bytes. Their
three-argument method forms take object size and count; explicit zero counts
perform no I/O. Reads replace the output with the bytes read, including an empty
string at EOF, and respect typed references. Reads/writes return object counts.
Sizes, positions and unsigned endian reads use exact decimal strings when their
values exceed PHP's integer range. BMP loaders honor `freesrc`/`freedst` by
closing the wrapper and invalidating aliases; saved pixels are snapshotted
before a custom stream callback can destroy their source surface.

After halting playback and freeing music/chunks, close the audio device with
`Mix_CloseAudio()` and unload initialized decoders with `Mix_Quit()`. The cube
does both on Stop and on failed audio setup, so retries start from clean state.

Register browser animation cleanup in `vrzno_env('onRefresh')` so callbacks,
listeners and native resources are released before PHP request memory resets.
The cube demonstrates idempotent cleanup on rerun, refresh, errors and page exit.
SDL initialization disables implicit Asyncify sleeps during buffer swaps, including
after `SDL_Quit()`. This also makes `SDL_Delay()` a blocking wait; do not use
it to yield a browser game loop. Animation callbacks stay synchronous; use the
browser's `requestAnimationFrame` to schedule frames, as in both examples.
A PHP loop can explicitly await a JavaScript frame Promise with `vrzno_await()`.

## Input, textures, fonts and timing

The current development build adds the bindings below. Ship the cube and its
matching runtime together: the cube now uses native SDL_ttf UTF-8, bold and
outline APIs, without converting its strings to Latin-1.

After a local native rebuild, restart Vite with `--force` and reload the demo.
Vite can retain the previous generated JavaScript while serving the new Wasm;
both files must come from the same build.

| Area | Added support |
| --- | --- |
| Events | Mouse-up, precise wheel, relative motion, key state/repeat/scancode/modifiers, text/composition payloads, touch, joystick hats/balls and hotplug, controller axes/buttons/hotplug/touchpads, audio/display/drop payloads |
| Textures | Packed updates, streaming locks, color/alpha/blend/scale settings, checked readback, and `SDL_SetRenderTarget($renderer, null)` |
| Fonts | UTF-8 Solid/Blended/Shaded rendering and wrapping; text/glyph metrics; bold/italic/underline/strikeout, outline, hinting, kerning and size |
| Controllers | Standard axes/buttons, direct joystick button/hat polling, attachment and instance IDs, mappings and explicit updates |
| OpenGL | Float/int scalar and vector-array uniforms (1–4 components), square 2/3/4 matrices and WebGL2 rectangular matrices |
| Timing | `SDL_GetTicks`, `SDL_GetTicks64`, `SDL_GetPerformanceCounter`, `SDL_GetPerformanceFrequency` |

Events retain SDL's field names: `$event->wheel->preciseY`,
`$event->key->repeat`, `$event->text->text`, `$event->tfinger->fingerId` and
`$event->cdevice->which`. Device-added events use a device index; removed/input
events use an instance ID. Empty polling leaves the previous event unchanged.
`SDL_PushEvent()` accepts typed input payloads; pointer-bearing events such as
file/text drops and extended IME strings cannot be pushed from PHP.
`SDL_PumpEvents()` explicitly samples browser input.

After initializing SDL video, call `SDL_StartTextInput()` when entering a text
field and `SDL_StopTextInput()` when leaving it. A request made before window
creation activates browser editing when the window is created; stop also
cancels a pending request. Committed Unicode arrives in
`$event->text->text`; in-progress composition arrives in `$event->edit->text`
with selection `start`/`length` measured in Unicode codepoints. Long commits
are split into native SDL events without splitting a UTF-8 character; native
event-size limits and filtering still apply. Physical key events remain
available separately. Ordinary keypress input works before an explicit start;
SDL's implicit video-initialization call does not open a browser editing surface.

Browsers with `EditContext` use the supplied canvas as the editing surface,
including in fullscreen. Other browsers use an owned textarea beside the
canvas. The textarea cannot receive IME input while the canvas itself is
fullscreen: `SDL_StartTextInput()` still has its native void return, and
`SDL_GetError()` reports that fullscreen IME requires `EditContext`. Ordinary
keypresses remain available, and the textarea can resume after fullscreen
exits. Start text input from a user gesture where the browser requires one for
its on-screen keyboard; SDL's native screen-keyboard queries do not report
browser keyboard visibility.

`SDL_SetTextInputRect()` positions the candidate-window hint in SDL window
coordinates, accounting for canvas CSS scaling and shadow roots. It supplies
one rectangle, not per-character glyph layout. Stopping input cancels
unfinished composition and returns owned focus to the canvas without taking
focus from another control. Window destruction, video shutdown and PHP refresh
remove the owned editing surface and its callbacks. Browser transport tests do
not establish physical OS IME coverage or complex-script font shaping.

Fullscreen uses the supplied canvas, including custom IDs and shadow roots,
and restores its dimensions and inline styles on exit.
`SDL_SetWindowFullscreen($window, $flags)` returns `-1` with an SDL error when
fullscreen is unavailable or blocked by browser policy. A `0` result accepts
the request; it can still wait for a user gesture. Observe the browser's
`fullscreenchange`/`fullscreenerror` events when actual browser entry matters.
Destroying the window, quitting video or refreshing PHP cancels deferred work
and removes resize callbacks before their native window data is freed.

`SDL_GetRelativeMouseMode()` reports the requested mode. The browser can exit
pointer lock while that mode remains enabled, allowing SDL to request it again
on a later click. Use `document.pointerLockElement` and browser
`pointerlockchange`/`pointerlockerror` events for actual lock state.
A missing pointer-lock API or focused SDL window fails immediately with -1 and
`SDL_GetError()`. Browser requests accepted for processing still return 0; an
asynchronous denial sets `SDL_GetError()` without an unhandled Promise rejection.
Disabling relative mode cancels queued requests. Window/video teardown and PHP
refresh release the SDL canvas lock while preserving another element's lock.
Retired request completions cannot set a replacement window's error or undo its
requested mode. For a canvas inside a shadow root, read that root's
`pointerLockElement` to determine the actual locked canvas.

Browser window blur releases held keys and modifiers and sends SDL focus
events. Touch positions/deltas are normalized to the canvas; the pinned
backend reports pressure as 1. Reconnecting a gamepad at the same browser
index gives it a new SDL instance ID; retained handles for the old instance
remain detached.

```php
if (SDL_InitSubSystem(SDL_INIT_GAMECONTROLLER) !== 0) {
    throw new RuntimeException(SDL_GetError());
}
$controller = SDL_GameControllerOpen(0);
if ($controller && SDL_GameControllerGetAttached($controller)) {
    SDL_GameControllerUpdate();
    $horizontal = SDL_GameControllerGetAxis($controller, SDL_CONTROLLER_AXIS_LEFTX);
    $pressed = SDL_GameControllerGetButton($controller, SDL_CONTROLLER_BUTTON_A);
}
if ($controller) { SDL_GameControllerClose($controller); }
SDL_QuitSubSystem(SDL_INIT_GAMECONTROLLER);
```

The browser controls gamepad visibility, often requiring a button press first.
Keep the controller open and call `SDL_GameControllerUpdate()` each frame when
polling continuously.
Opening an unavailable device returns null. Closed handles raise an Error on
use; closing twice is harmless. `SDL_GameControllerGetJoystick()` acquires a
separate reference, so closing either handle leaves the other usable. Close
that joystick too. Request shutdown and `SDL_Quit()` release remaining handles.

`SDL_UpdateTexture($texture, $rect, $pixels, $pitch)` accepts packed bytes or a
live `SDL_Pixels` buffer, including a surface view, with checked rectangle
bounds, pitch and byte length. Lock an RLE surface before accessing or
uploading its pixels. `SDL_CreateTextureFromSurface()` remains available when
SDL should handle the surface format conversion.
Planar YUV/indexed formats are unsupported by this upload path.
`SDL_RenderReadPixels($renderer, $rect, $format)` returns tightly packed bytes,
or null on a native failure.

`SDL_LockTexture($texture, $rect, $pixels, $pitch)` fills its last two arguments
by reference and returns SDL's status code. A successful lock returns a
zero-initialized, PHP-owned `SDL_Pixels` buffer, accessed by byte offset:
`$pixels[$y * $pitch + $x * 4] = 255` writes red in an ABGR8888 texture on Wasm.
Fill every pixel in the locked region, then call `SDL_UnlockTexture($texture)`.
The returned pitch belongs to the PHP staging buffer. Unlock uploads once;
subsequent changes to a retained buffer do not affect the texture. The buffer
does not expose existing texture contents or a native pointer.

Destroying a locked texture discards pending writes. Destroying a renderer or
window invalidates its textures, including `IMG_LoadTexture()` results. Invalid
resources raise errors instead of passing stale pointers to SDL. Retained
pixel buffers remain valid after unlock or destruction. Keep the window and
renderer handles alive while drawing; dropping their last PHP reference also
releases their native resources.


### Surface and pixel lifetimes

`$surface->pixels`, `$surface->format` and `$format->palette` retain their PHP
owner. Dropping the original variable leaves a retained view usable. Explicit
`SDL_FreeSurface()` invalidates all its views; window resize/destruction and
video shutdown invalidate wrappers for native window surfaces. Fetch the new
window surface after resizing. Freeing a borrowed format, palette or window
surface directly raises an Error; release its owner instead.

Pixel and palette reads, writes, metadata and native calls check the owner.
Replacing a format's palette invalidates its earlier palette views. RLE pixel
access requires a successful `SDL_LockSurface()` and ends at
`SDL_UnlockSurface()`; views refresh their storage address on each access.
View/owner cycles participate in PHP garbage collection. Surface, format,
palette and pixel wrappers cannot be cloned, serialized or reconstructed in
place. Explicit frees of owned surfaces, formats and palettes are idempotent.

`new SDL_Pixels($pitch, $height)` allocates zeroed storage and rounds pitch up
to four-byte alignment. Dimensions must be positive, and the aligned allocation
must fit signed int32. `SDL_ConvertPixels()` validates both buffers, packed
formats and row pitches, writes the destination, and supports overlapping
source/destination storage through a temporary source copy. Indexed and planar
formats need a different conversion path.

Blit output rectangles retain their object identity. Lower blits require
positive rectangles entirely inside each surface; unscaled lower blits also
require matching dimensions because these native calls bypass normal clipping.
Rectangle/color array counts must fit the input; zero selects all elements,
and indices must start at zero without gaps. These blit and renderer calls
snapshot shape fields before native pointer lookup so property callbacks
cannot leave stale pointers.

Texture-lock outputs respect typed references. If an output destructor destroys
or changes the lock, the call raises a catchable Error. Cleanup releases only
that call's lock, preserving a newer lock created by the callback.

`TTF_*UTF8*` functions accept UTF-8; the original `TTF_*Text*` names retain
Latin-1 behavior. Glyph functions take numeric Unicode code points; use their
`32` variants for supplementary characters. Metrics fill output arguments by
reference and return SDL's status code. A wrap length of zero wraps only at
newlines. Font styles/outlines are applied natively. HarfBuzz remains disabled,
so these bindings do not add complex-script shaping. Fonts close on explicit
`TTF_CloseFont()`, when PHP drops their last reference, or at final SDL_ttf
shutdown. Balanced `TTF_Init()`/`TTF_Quit()` calls preserve fonts while the
initialization count remains positive. Color-property callbacks are evaluated
before checking font liveness; metrics stop assigning outputs after an exception.

Unsigned timers and 64-bit touch IDs return integers when they fit PHP's integer
range, otherwise exact decimal strings. PHP-Wasm has 32-bit PHP integers; cast
to float for ordinary elapsed-time calculations and retain strings for exact
counter/identifier values. Counter units come from
`SDL_GetPerformanceFrequency()`; ticks are milliseconds.

Desktop window management, threads, haptics, sensors and additional codecs
remain outside this build. The browser/Emscripten backend still determines
which native features can produce events.

See [core signatures](core/php_sdl_extra.stub.php) and
[font signatures](ttf/php_ttf_extra.stub.php) for the added PHP APIs.

## SDL geometry and renderer state

`SDL_RenderGeometry($renderer, $texture, $vertices, $indices = null)` submits
colored or textured triangles through SDL's renderer. Each vertex is a tuple
`[x, y, red, green, blue, alpha, u, v]`; colors are integers from 0 to 255 and
positions/UVs are finite numbers. Counts come from the arrays. A null texture
draws vertex colors, and null indices draw sequential triangles:

```php
$vertices = [
    [0, 0, 255, 255, 255, 255, 0, 0],
    [64, 0, 255, 255, 255, 255, 1, 0],
    [64, 64, 255, 255, 255, 255, 1, 1],
    [0, 64, 255, 255, 255, 255, 0, 1],
];
if (SDL_RenderGeometry($renderer, $texture, $vertices, [0, 1, 2, 0, 2, 3]) !== 0) {
    throw new RuntimeException(SDL_GetError());
}
```

`SDL_RenderGeometryRaw()` accepts PHP strings containing packed float32 XY/UV
pairs and RGBA bytes, with explicit byte strides and vertex/index counts.
On Wasm, use `pack('g*', ...)` for coordinates and `pack('C*', ...)`,
`pack('v*', ...)` or `pack('V*', ...)` for unsigned 1/2/4-byte indices. A zero
stride repeats one element; buffers may include padding. UV data may be null
when the texture is null. Short buffers, incomplete triangles, invalid indices,
misaligned coordinate strides and nonfinite coordinates raise exceptions
before drawing. Neither entrypoint accepts native heap addresses. Geometry
uses vertex color/alpha modulation; SDL's texture color/alpha modifiers are
ignored, as in native SDL. Texture or renderer blend mode controls blending.

`SDL_RenderDrawPoints`, `SDL_RenderDrawLines`, `SDL_RenderDrawRects` and
`SDL_RenderFillRects` accept arrays of `SDL_Point` or `SDL_Rect` objects.
Their `F` variants accept `SDL_FPoint` or `SDL_FRect`. Empty batches succeed
without drawing. Inputs remain unchanged, and callbacks from subclass property
getters cannot leave the batch using a destroyed renderer.

Viewport, clip rectangle, logical size, integer scale and explicit scale have
the native SDL setter/getter names. Pass null to reset a viewport or disable
clipping. Getters fill output arguments by reference. Renderer/driver info
queries return arrays with `name`, `flags`, `num_texture_formats`,
`texture_formats`, `max_texture_width` and `max_texture_height`; query support
before selecting a rendering path. Draw-color/blend queries and
`SDL_RenderTargetSupported()` are also available. Status-returning functions
retain SDL's 0/-1 contract; inspect `SDL_GetError()` on failure. See the
[geometry signatures](core/php_sdl_geometry.stub.php) for exact argument and
return types.

`SDL_RenderWindowToLogical($renderer, $windowX, $windowY, &$logicalX, &$logicalY)`
returns floating-point logical coordinates through its two outputs.
`SDL_RenderLogicalToWindow($renderer, $logicalX, $logicalY, &$windowX, &$windowY)`
returns window integers, truncating toward zero as SDL does. Both functions
return void and use the renderer's current viewport, scale, logical resolution
and target state. Positions outside a letterboxed scene can produce negative
logical coordinates; they are not clamped to the scene. SDL already adjusts
mouse events when logical sizing is enabled; convert positions that are still
in window space, rather than applying the transform to those events again.

Window inputs must fit int32 and logical inputs must fit finite float32.
Nonfinite results, overflowing intermediate products and transforms too close
to the int32 limits for safe float32 conversion raise `ValueError` before
outputs change. The reverse conversion conservatively rejects transforms whose
inverse cannot establish safe bounds, including zero scale. Output assignment
respects typed references and stops at the first exception. A destructor may
close the renderer while an output is replaced; both coordinates have already
been captured before any such callback.

## OpenGL shader API

The browser implementation replaces the old desktop translation unit. It offers
shader compilation/link diagnostics, programs, uniforms, vertex/index buffers,
vertex arrays, instanced drawing, uniform blocks/reflection, textures,
depth/stencil and multisample renderbuffers, multiple framebuffer outputs,
render state and pixel readback.
See [php_webgl.stub.php](opengl/php_webgl.stub.php) for the complete supported API.
Desktop immediate-mode functions and unimplemented desktop stubs are omitted.

Create and make current an SDL OpenGL ES 3 context before using these bindings.
GL driver errors are available through `glGetError()`. Invalid PHP buffer sizes,
unsafe pixel layouts and invalid offsets raise exceptions before native access.

Keep the object returned by `SDL_GL_CreateContext()`,
`$window->GL_CreateContext()` or `new SDL_GLContext($window)` while using it.
These objects own their native context and delete it on last-reference cleanup.
`SDL_GL_GetCurrentContext()` returns a borrowed alias. Explicit deletion through
any alias invalidates all aliases; repeating deletion is harmless, but using a
destroyed context raises an `Error`. Contexts cannot be cloned or serialized.
`SDL_GL_MakeCurrent(null, null)` unbinds the current context without deleting it.

The pinned browser backend supports one live SDL GL context per PHP runtime.
Close the current one before creating another context or renderer, even if it
has been unbound.
A context obtained from an SDL renderer belongs to that renderer: destroy the
renderer, not the borrowed GL context. Window destruction, video reinitialization,
the last video subsystem quit and `SDL_Quit()` invalidate related context
aliases and release their GL allocations. Extra video subsystem references
keep the context alive until the final quit.

Browser context loss invalidates GPU resources. After `webglcontextrestored`,
recreate them and reapply render state; deleting the old names is harmless.
The binding resets the SDK's cached bindings and restores automatically enabled
extensions, so new pixel uploads and compressed textures work after restoration.
It does not retain or reload your assets.

- `glBufferData()`/`glBufferSubData()` accept packed byte strings (`pack('g*',
  ...$floats)` for little-endian float32); null allocates an empty buffer.
- `glVertexAttribPointer()` takes a byte offset in the bound vertex buffer.
  `glDrawElements()` takes a checked, aligned offset in a bound index buffer.
  The instanced variants use the same offsets; `glVertexAttribDivisor()` selects
  per-instance data. `glVertexAttribIPointer()` preserves integer attribute
  values instead of converting/normalizing them. Attribute strides must fit
  WebGL's 255-byte limit and align with the component type.
  Layouts can be configured before uploading buffer storage. WebGL applies
  vertex-fetch bounds at draw time; no PHP heap pointer is accepted.
- `glTexImage2D()` and `glTexSubImage2D()` accept checked pixel bytes or a live
  `SDL_Surface`. Surface dimensions must match and the format/type must be
  `GL_RGBA`/`GL_UNSIGNED_BYTE`; conversion happens natively. Only image allocation
  accepts null. `glTexImage3D()`/`glTexSubImage3D()` take packed byte strings for
  volume and array textures. `glTexStorage2D()`/`glTexStorage3D()` allocate
  immutable storage, including cube faces and mip levels.
- Pixel transfers honor `PACK`/`UNPACK_ALIGNMENT`, row lengths and skipped rows
  and pixels; 3D uploads also honor image height and skipped images. Byte lengths
  include prefixes and padding. Invalid overlapping source layouts, short data
  and overflowing ranges raise `ValueError`. Surface conversion temporarily
  resets all unpack offsets and restores the caller's state afterward.
  `glReadPixels()` returns zeroed prefix/padding bytes, including when the native
  read fails. PHP byte transfers require no pixel-buffer binding. Null allocation
  has no client-data layout; WebGL's float32 depth/stencil type is allocation-only.
- Compressed 2D/3D image and subimage calls accept an explicit `imageSize` and
  byte string. The size must equal the format's block layout and fit the string.
  Query `glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS)` first: formats missing from
  the current context raise `ValueError`. Checked layouts cover S3TC, ETC1,
  ETC2/EAC, RGTC, BPTC, 2D ASTC footprints and PVRTC1. Native WebGL still checks
  target, mip and block-offset restrictions; array support does not imply that
  a format accepts volume textures. Enum availability is not a capability check.
- Texture and sampler parameter queries return scalar integers or floats.
  Samplers have generation, binding, integer/float setters, queries and deletion;
  binding a sampler to a texture unit overrides that texture's sampling state.
  Samplers share context ownership and output-reference checks with other GL names.
- `glUniform1fv()`–`glUniform4fv()` and their integer `iv` variants take exactly
  `count * components` values. Float values must fit finite float32; integer
  values must fit int32. Scalar setters follow the same rules.
- Matrix setters take exactly `count * columns * rows` finite float32 numbers,
  column-major, with transpose false. Square 2/3/4 and rectangular 2x3, 3x2,
  2x4, 4x2, 3x4 and 4x3 forms are available.
  `glShaderSource()` takes one string (`count=1`).
- Unsigned `ui`/`uiv` setters accept nonnegative integers or exact decimal
  strings through `4294967295`. Use strings above PHP's signed 32-bit integer
  range; negative values, floats, overflow and malformed strings are rejected.
- `glBindBufferBase()` and `glBindBufferRange()` attach uniform buffers.
  Range offsets must respect `GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT`; sizes must
  be positive and stay within the allocated buffer. Reflection exposes block
  sizes, member offsets, array/matrix strides, names and types, so code can
  build buffers from the linked shader's layout. Missing uniform/block names
  return `GL_INVALID_INDEX` (`-1` on PHP-Wasm).
- `glGetActiveUniform()`/`glGetActiveAttrib()` return `name`, `size` and `type`.
  Block queries return integers except `GL_UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES`,
  which returns an array. `glGetInternalformativ()` returns an array for
  `GL_SAMPLES` and an integer for `GL_NUM_SAMPLE_COUNTS`.
- Renderbuffers support color/depth/stencil storage and multisampling.
  Use the format's supported sample counts, attach storage to a framebuffer,
  check its completeness, and resolve with `glBlitFramebuffer()` before
  sampling or reading multisampled color. Depth/stencil blits require
  `GL_NEAREST`. `glDrawBuffers()` takes an exact count and attachment array.
- Generation functions fill PHP arrays by reference. Delete functions require
  exactly the declared number of unsigned handles. Release resources when they
  are no longer needed; context teardown also deletes remaining PHP-created
  buffers, textures, samplers, vertex arrays, framebuffers, renderbuffers, shaders and
  programs. Typed-output failure releases new allocations. If replacing the
  output runs a destructor that switches or destroys the context, generation
  raises an `Error`; any resulting old handles are invalid. Shader/program
  operations reject deleted names with a catchable `ValueError`.
- `glGetIntegerv()`, `glGetFloatv()` and `glGetBooleanv()` return a scalar or an
  array according to the selector. For example, `GL_VIEWPORT` returns four
  integers and `GL_COLOR_WRITEMASK` returns four booleans. Unknown selectors are
  rejected before native access. `glGetStringi(GL_EXTENSIONS, $index)` enumerates
  context extensions; enum availability alone does not imply format support.

The new WebGL2 operations reject a WebGL1 context with a catchable PHP error.
The [coverage contract](COVERAGE.md) distinguishes implemented primitives,
native verification, remaining performance/device work and backend limits.

These signatures correct unsafe or empty behavior in the upstream desktop
binding; code written against those old signatures may need adjustment.

To regenerate PHP 8.0-compatible arginfo after an API change:

```sh
php third_party/php8.0-src/build/gen_stub.php packages/sdl/opengl/php_webgl.stub.php
php third_party/php8.0-src/build/gen_stub.php packages/sdl/core/php_sdl_extra.stub.php
php third_party/php8.0-src/build/gen_stub.php packages/sdl/core/php_sdl_geometry.stub.php
php third_party/php8.0-src/build/gen_stub.php packages/sdl/ttf/php_ttf_extra.stub.php
```

The Make/configuration tests run with `node --test test/build/sdl.test.mjs`.
Run browser tests against the normal browser harness server:

```sh
PHP_VERSION=8.4 PHP_VARIANT=_sdl LIB_TYPE=static npm run test:browser -- test/browser/sdl.spec.mjs test/browser/sdl-bindings.spec.mjs test/browser/sdl-engine.spec.mjs test/browser/sdl-geometry.spec.mjs test/browser/sdl-lifetimes.spec.mjs test/browser/sdl-buffers.spec.mjs
```

CI builds and checks SDL artifacts for PHP 8.0–8.5 under the three existing
library profiles.

The GL lifetime candidate passes 29 native SDL browser tests, two editor smoke
tests and nine Make/npm checks on PHP 8.4 static. C syntax checks pass for
PHP 8.0–8.5. Tests count browser GPU allocations/deletions across window/video
teardown, failed output assignments, 40 context cycles and three request
refreshes. These results do not replace the remaining native ownership audit
or the complete remote matrix.

## Build measurements

Measured on 2026-09-20 with PHP 8.4.1, the static CI profile and Emscripten
6.0.6. The baseline is the core SDL runtime at `eca81a6`; the expanded build
includes the extensions and callback fixes, before MP3 support was added. Sizes combine
the JavaScript and Wasm files, in bytes:

| Encoding | Core SDL | Expanded SDL | Increase |
| --- | ---: | ---: | ---: |
| Raw | 50,942,530 | 51,499,398 | 556,868 (1.09%) |
| gzip, level 9 | 13,802,830 | 13,922,591 | 119,761 (0.87%) |
| Brotli, quality 11 | 9,314,484 | 9,508,327 | 193,843 (2.08%) |

The separate 30,873,664-byte ICU data file is unchanged. At this measurement,
the font and generated Ogg/WAV assets added 362,265 raw bytes. The current
cube plays the supplied 3,063,619-byte MP3, bringing preloaded font/audio assets
to 3,425,884 raw bytes. Its texture reuses the existing icon. These assets are
downloaded separately from the runtime. The original 12,025-byte Ogg remains
available for older shared cube links and tests.

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

The 2026-09-21 MP3 follow-up uses the same PHP/toolchain/profile. Adding the
bundled minimp3 decoder changes the combined JavaScript/Wasm sizes as follows;
the JavaScript has the same raw size, and ICU data is byte-for-byte identical:

| Encoding | With MP3 | Added to expanded SDL |
| --- | ---: | ---: |
| Raw | 51,556,274 | 56,876 |
| gzip, level 9 | 13,947,279 | 24,688 |
| Brotli, quality 11 | 9,532,800 | 24,473 |

Three interleaved before/after runs in fresh Chromium processes measured median
runtime readiness at 946 ms before MP3 and 927 ms after. First PHP execution
completed at 965/942 ms, and the cube's first frame after assets took 383/359 ms.
Both builds ran the same current cube with audio off. This small local sample
does not demonstrate a startup regression or establish a speedup.

With MP3 playing, three 180-frame samples averaged 58.4–59.7 FPS at 640×400,
with 16.7 ms median and 16.8 ms p95 frame intervals under SwiftShader. Music was
measured after the muted phase, so warm-up prevents comparing their FPS as an
audio overhead measurement.

The original MP3 adds 3,063,619 bytes to the separate demo downloads. Track
metadata, artifact hashes, sizes and all timing samples are in the
[MP3 measurement record](benchmarks/2026-09-21-mp3.json).

The subsequent 91-function binding expansion uses the same PHP/toolchain/profile.
Compared with the MP3 build, its combined JavaScript/Wasm payload changes by:

| Encoding | With binding additions | Increase |
| --- | ---: | ---: |
| Raw | 51,646,845 | 90,571 (0.18%) |
| gzip, level 9 | 13,962,831 | 15,552 (0.11%) |
| Brotli, quality 11 | 9,554,323 | 21,523 (0.23%) |

ICU data is byte-for-byte unchanged. The JavaScript has the same raw length,
but its generated glue changed and must ship with its matching Wasm. Both
builds were recompressed with the same Node/zlib versions. Hashes and per-file
sizes are in the [binding measurement record](benchmarks/2026-09-21-bindings.json).
This comparison measures size only; the earlier startup/FPS figures do not
measure the binding additions.

The first WebGL2 completion group (instancing, UBOs/reflection, unsigned
uniforms, render targets and state queries) adds another 103,176 raw bytes
(0.20%) or 18,986 gzip bytes (0.14%). Its Brotli result is 2,013 bytes smaller
(0.02%); compressed size need not grow monotonically with native code size.
The combined totals are 51,750,021 raw, 13,981,817 gzip and 9,552,310 Brotli
bytes. ICU is unchanged. The [WebGL2 measurement record](benchmarks/2026-09-21-webgl2.json)
identifies both matching JS/Wasm pairs and the compression settings. These
are size measurements, not throughput or startup measurements.

The 28 SDL geometry/batch/state bindings add 32,400 raw bytes (0.06%) or 7,974
gzip bytes (0.06%) over that WebGL2 group. Brotli is 6,042 bytes smaller (0.06%).
Combined totals are 51,782,421 raw, 13,989,791 gzip and 9,546,268 Brotli bytes;
ICU is unchanged. The [geometry size record](benchmarks/2026-09-21-geometry.json)
contains the matching artifact hashes and compressor settings. The included
[`measure-size.mjs`](benchmarks/measure-size.mjs) reproduces the comparison
from preserved baseline and candidate directories.

The GL lifetime fixes add 1,810 raw bytes (0.0035%), 2,737 gzip bytes (0.020%)
and 7,424 Brotli bytes (0.078%) over the geometry build. Combined totals are
51,784,231 raw, 13,992,528 gzip and 9,553,692 Brotli bytes; ICU is unchanged.
The [lifetime size record](benchmarks/2026-09-21-lifetimes.json) identifies both
matching artifact pairs and the identical compressor settings used for them.

The [surface/buffer size record](benchmarks/2026-09-21-buffers.json) compares
the next matching pair against that lifetime build: +10,621 raw bytes and
+2,308 gzip bytes; Brotli is 4,731 bytes smaller. Combined totals are
51,794,852 raw, 13,994,836 gzip and 9,548,961 Brotli bytes. ICU is unchanged.
This group passes 39 distinct native SDL tests, two editor smoke tests, nine
Make/npm checks and the main-module validator on PHP 8.4 static. Fresh imports
and C syntax checks pass for PHP 8.0–8.5. These results cover the tested
surface/renderer paths. Later ownership verification appears below; the full
remote matrix remains pending.


The SDL geometry follow-up was measured twice on PHP 8.4.1 static with internal
Chromium/SwiftShader and no native build running. Each of 12 samples repeats
64 batches of 1,024 prepared, untextured rectangles; the medians below are
normalized to 1,024 rectangles. Four warmup samples precede each case. A pixel
readback verifies drawing and forces completion after submission:

| API | Submission ms, run 1 / 2 | Total ms, run 1 / 2 |
| --- | ---: | ---: |
| 1,024 `SDL_RenderFillRect` calls | 1.484 / 1.563 | 2.047 / 2.078 |
| One `SDL_RenderFillRects` batch | 0.875 / 0.891 | 1.430 / 1.508 |
| Indexed `SDL_RenderGeometry` arrays | 1.109 / 1.086 | 1.609 / 1.719 |
| Indexed `SDL_RenderGeometryRaw` bytes | 0.109 / 0.102 | 0.664 / 0.727 |

Prepared inputs exclude object/array construction and packing. Submission
includes PHP/native calls and SDL queueing. Completion is amortized over the
repeated draws; this does not predict game FPS or hardware GPU performance.
The Wasm heap remained at 128 MiB during these short runs. PHP allocator
accounting returns zero in this build, so those readings are unavailable;
neither observation establishes leak freedom. See the complete
[first](benchmarks/2026-09-21-geometry-draw-first.json) and
[second](benchmarks/2026-09-21-geometry-draw-second.json) records for raw samples,
renderer/machine details, load, and artifact hashes. Run the checkout's
`test/perf/sdl/run.mjs` to repeat the comparison.

## Malformed assets and mixer input cleanup

The four native cases in `test/browser/sdl-stress.spec.mjs` repeat malformed
PNG/JPEG/BMP, TTF, WAV/Ogg/MP3 and filename/RWops input paths, then require valid
loading/rendering or playback to recover. They measure SDL allocations, live
native bytes and open file descriptors across a warmup and three batches.
Expected libpng truncated-header diagnostics are validated explicitly; other
stderr and browser errors fail the checks.

Two cases reproduce a pinned SDL_mixer failure-path leak before `401f6d9`.
`Mix_LoadMusic_RW()` returned without closing owned input when format detection,
loading or opening failed. The existing package-local SDL2_mixer patch now closes
that stream. Borrowed RWops and PHP stream autoclose semantics are preserved.
The broad audio case previously grew from 46 to 166 SDL allocations and 14 to
134 file descriptors. On the normal PHP 8.4 static Make build, it stays at
36 allocations and four descriptors, then returns to zero SDL allocations on
shutdown. The focused RWops case is also flat; PNG/JPEG/BMP and font cases stay
flat on both builds. These are finite ownership checks, not decoder fuzzing or
general leak-freedom claims. The subsequent PNG callback correction is recorded
below (VO note 75).

All four new cases and 32 affected existing audio/stream/cube cases pass on the
matching candidate, with no skips or flaky results. Both editor checks,
main-module validation, ten Make/package checks and JS style also pass.
`packages/sdl/benchmarks/2026-09-22-malformed-assets.json` preserves before/after evidence.
`benchmarks/2026-09-22-malformed-size.json` records +57 raw bytes, −35 gzip
bytes and −2,407 Brotli bytes for the matching pair; JS and ICU are unchanged.
Full PHP/profile remote
verification of this commit remains pending; running CI on `17d386c` proves
only that preceding source.


### PNG short-read recovery

SDL_image's PNG callback now checks the exact byte count returned by RWops
and calls the selected libpng provider's error handler on a short read.
The existing cleanup releases decoder/surface state and returns null with
an SDL error. The package-local `SDL2_image.patch` follows the native Make
patch prerequisites and is included in npm; codec providers and versions
are unchanged.

A regression fails on the preceding runtime: six cuts through headers, IDAT
data and CRCs reach later parser errors instead of the required read error.
On the corrected normal PHP 8.4 static build, both image loaders reject all
six cuts with `libpng error: Read Error`; complete-image loading and full
rendered pixels recover after every cut. All five malformed-asset cases pass,
including repeated allocation and file-descriptor checks. The record
`benchmarks/2026-09-22-png.json` preserves before/after evidence and artifact
hashes. This checks the callback contract; it does not claim that the tested
baseline accepted malformed PNGs or establish general decoder safety.

The corrected PNG pair passes 32 existing audio/stream/cube cases, main-module
validation and eleven Make/package checks. Compared with the previous pair,
raw JS/Wasm is 166 bytes smaller, gzip grows by 334 bytes and Brotli by 2,040
bytes; JS and ICU are unchanged. Both sides use the same compressors/settings.
See `benchmarks/2026-09-22-png-size.json`. Full remote verification remains
pending for this source.


## Rendering and event throughput baseline

Two idle runs on the matching `401f6d9` PHP 8.4.1 static Make build use internal
Chromium/SwiftShader, prepared inputs, four warmups and twelve rotating samples
per case. Complete framebuffer comparisons verify the rendering paths, and
event tests check every payload and count. These are total milliseconds per
batch, including amortized readback after repeated submissions:

| Path | Batch | Total ms, run 1 / 2 |
| --- | --- | ---: |
| Ordinary array draws | 1,024 triangles | 37.422 / 13.453 |
| Instanced array draw | 1,024 triangles | 29.703 / 11.703 |
| Ordinary indexed draws | 1,024 triangles | 221.688 / 99.891 |
| Instanced indexed draw | 1,024 triangles | 36.000 / 11.219 |
| Scalar uniform setters + draw | 64 vec4 values | 0.172 / 0.164 |
| Uniform array + draw | 64 vec4 values | 0.102 / 0.109 |
| UBO update + draw | 1 KiB | 0.098 / 0.094 |
| Texture image replacement + draw | 256 × 256 RGBA | 0.250 / 0.367 |
| Texture subimage update + draw | 256 × 256 RGBA | 0.242 / 0.375 |
| SDL texture update + copy | 256 × 256 RGBA | 0.219 / 0.219 |
| Event push/poll + payload checks | 32 events | 0.316 / 0.294 |
| Event push/poll + payload checks | 1,024 events | 9.938 / 9.719 |

Individual indexed draws have a large submission cost here. The checked
binding queries the bound index buffer and its size on each call; instancing
amortizes that validation. The source identifies a candidate for investigation,
but these measurements do not isolate the cost of each browser operation.
Ordinary draws update a per-triangle offset uniform; instanced draws preload
offset attributes. Non-indexed instanced submission falls below the SDL clock's
resolution, so the report leaves its call rate unavailable. Draw and texture
results vary substantially between runs; retain both and avoid treating them
as hardware GPU results or game FPS limits.

Native allocation counts and live bytes plateau during the sampled rounds.
Graphics cleanup leaves the three known SDL TLS allocations, and event cleanup
returns to zero. Prepared PHP inputs remain live until request refresh; reserved
heap capacity is distinct from live allocations. This does not prove general
leak freedom. Reports include raw samples, frame callback execution intervals,
native/V8 memory, machine/load, and exact artifact/fixture hashes:
[first run](benchmarks/2026-09-22-throughput-first.json),
[second run](benchmarks/2026-09-22-throughput-second.json).
Use `test/perf/sdl/throughput.mjs` as described in `test/perf/sdl/README.md`.
These runs include the mixer cleanup correction. Texture/uniform cases first
render the opposite data, so stale state cannot mask a missing update; four
driver no-op probes confirm those checks fail. SDL texture measurements use
WebGL1, while the direct GL paths use WebGL2. Concurrent mixer throughput and
indexed-query profiling remain separate work.

## RWops and font lifetime verification

The stream/font PHP 8.4 static Make build passed 49 native SDL browser tests, two
editor smoke tests, nine Make/npm checks and the main-module validator. Fresh
PECL imports and C syntax checks pass across PHP 8.0–8.5. The ten new tests cover
raw RWops allocation/destruction, memory COW and lengths, PHP file/memory/temp/
custom streams, `fclose`/`pclose` and reentrant callbacks, BMP snapshots and alias
closure, mixer input ownership, typed outputs, GC cycles and SDL_ttf reference
counts. Native allocation counts return to baseline across repeated font/RWops
batches, and live allocator growth stays bounded. The full remote matrix and
remaining device and rendering work are still pending. Later cursor and mixer
verification is documented below.

`test/perf/sdl/font-lifetimes.mjs` reproduces the old font retention and compares
matching runtimes with builds, compression and other tests idle. Both recorded
runs agree after three batches of 50 fonts whose PHP references are dropped:

| Runtime | Retained SDL allocations | Live heap increase after 150 fonts |
| --- | ---: | ---: |
| Previous surface/buffer build | 600 | 7,643,664 bytes |
| Stream/font build | 0 | 40 bytes |

The new runtime's 40-byte increase occurs after the first batch and stays flat
for the next two. Final `TTF_Quit()` releases the old retained native fonts too.
Live bytes use dlmalloc accounting; reserved heap/Wasm capacity is separately
recorded and may remain reusable after frees. These results concern this font
fixture, not all resource types or rendering throughput. Full samples and
artifact/font hashes are in `benchmarks/2026-09-21-font-lifetimes-first.json`
and `benchmarks/2026-09-21-font-lifetimes-second.json`.

The matching pair is recorded in `benchmarks/2026-09-21-streams.json`:

| Artifact | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| `php8.4_sdl-web.mjs` | 4,761,786 | 652,866 | 465,186 |
| `php8.4_sdl-web.mjs.wasm` | 47,042,327 | 13,342,384 | 9,075,405 |

Compared with the preserved surface/buffer pair, combined size changes by
+9,261 raw bytes (+0.018%), +414 gzip bytes and -8,370 Brotli bytes using identical
compression settings. ICU remains byte-identical. Compressed size can decrease
after a code change; these numbers do not establish runtime speed.

## Cursors and mouse queries

Initialize SDL video before selecting a cursor. `SDL_Cursor` owns its native
cursor. `SDL_GetCursor()` returns the existing
wrapper, so an alias keeps the owner alive. Explicit `Free()` invalidates every
alias; later selection raises Error and repeated frees are harmless. The SDL
default cursor remains library-owned, and freeing its wrapper is a no-op.
Final video shutdown or video reinitialization invalidates all cursor wrappers;
an intermediate balanced subsystem quit leaves them usable.

Bitmap cursor data and masks must have exactly `width / 8 * height` bytes.
Dimensions must be positive, width must be divisible by eight, the expanded
pixel buffer must fit SDL's signed allocation limit, and the hotspot must be
inside the image. Color cursors require a live surface and an in-bounds hotspot.
Invalid sizes, hotspots and system IDs raise ValueError. Native creation errors
return null from factories or throw from the constructor. Cursors cannot be
cloned, serialized or reinitialized, including after an explicit free.

`SDL_SetCursor(null)` redraws the current cursor. `SDL_ShowCursor()` accepts
`SDL_QUERY` (-1), `SDL_DISABLE` (0) and `SDL_ENABLE` (1), and returns an integer.
A query leaves visibility unchanged. For a change, the pinned SDL implementation
returns the **previous** visibility. This corrects the earlier bool parameter
and return value, which accidentally treated queries as requests to show.
Mouse state outputs honor typed references and stop at the first exception.

SDL's default event target follows the canvas supplied to `PhpWeb`, including
canvases with custom IDs and those inside a shadow root. Its DOM ID is preserved;
another element named `canvas` does not redirect mouse callbacks.

The browser backend displays cursors through the canvas CSS. It does not
support mouse warping: `SDL_WarpMouseInWindow()`/`$window->WarpMouse()` leave
that native limitation visible through `SDL_GetError()`. Pointer lock and
relative motion still depend on browser gestures and focus; the cursor fixes
do not add automatic permission or gesture handling.

The cursor/input build passed 62 distinct native SDL browser tests on PHP 8.4
static, including thirteen cursor/input cases, plus both editor smoke tests,
nine Make/npm checks and the main-module validator. Fresh imports and C syntax
checks cover PHP 8.0–8.5. Tests cover native canvas mouse coordinates and relative
delta reset, custom IDs/shadow roots, cursor aliases, constructor reentry, video
reference counts, pre-video allocation cleanup, repeated request refresh and GC.
The complete remote PHP/profile matrix and the remaining mixer, input/device,
rendering remain open; PHP 8.0 serialization verification is recorded below.

`packages/sdl/benchmarks/2026-09-21-cursors.json` records the matching pair:
51,807,175 raw bytes, 13,996,319 gzip bytes and 9,545,914 Brotli bytes. Against
the stream/font pair, the changes are +3,062 raw, +1,069 gzip and +5,323 Brotli
bytes; ICU is unchanged. These are size measurements, not speed claims.

### Mixer ownership and audio restarts

Open the mixer before loading audio. Unused `Mix_Chunk` and `Mix_Music`
objects release native allocations when PHP drops the last reference.
Each allocated channel retains its associated chunk, including paused playback
and the last completed chunk returned by `Mix_GetChunk()`. Replacing a channel,
shrinking the allocation, freeing its chunk or closing audio releases that
association. A freed chunk is never recreated from a stale native pointer.
Music stays alive during playback; completion releases the playback reference
at the next PHP mixer call. Native audio callbacks do not run PHP.

`Mix_FreeMusic()` cancels that track's playback immediately, including a fade.
Starting another track also cancels an outstanding fade before replacing it.
These operations return while Web Audio is suspended. Freeing a different track
leaves the playing track alone. To hear a complete fade, wait for
`Mix_PlayingMusic()` to return zero before freeing or replacing it. Pausing,
resuming and browser audio permission remain explicit application decisions.

Matching `Mix_OpenAudio()` calls increment the native open count; each
`Mix_CloseAudio()` releases one reference. The final close stops playback and
invalidates loaded chunks and music. A changed audio format, final SDL audio
subsystem shutdown, direct native audio reinitialization or PHP `refresh()`
also closes the mixer and invalidates its objects. Reload assets after reopening
it. `Mix_Quit()` releases music before unloading decoders; decoded chunk playback
can continue. `Mix_OpenAudioDevice()` accepts `null` for the default device.
Native driver failures return their ordinary error value with `Mix_GetError()`
details. Zero-valued frequency, format, channel and buffer-size arguments retain
SDL_mixer's native default selection. Negative volume and channel-count query
values retain their native query behavior.

Channel operations check allocated indices and documented special values.
Invalid indices and narrowing/length errors raise catchable exceptions;
operations requiring an open device raise an Error after it closes.
`Mix_Playing(-1)`, `Mix_Paused(-1)` and `Mix_AllocateChannels(-1)` return zero
when closed, and `Mix_GetChunk()` returns null. Channel allocation rejects
native size overflow; if the allocator returns failure, the previous table is
preserved. Audio wrappers reject cloning and serialization.

Both RWops loaders snapshot remaining seekable input before entering a decoder,
honor `freesrc`, preserve PHP callback exceptions and recheck audio state after
callbacks. WAV decoding releases the snapshot immediately; streamed music keeps
it until freed. Query outputs honor PHP types and stop after an exception.

The normal PHP 8.4 static Make build passes 79 distinct native browser cases:
sixteen audio regressions, fourteen cursor/input regressions and 49 preceding
SDL tests. Both editor smoke tests, nine Make/npm checks and main-module
validation pass. Fresh imports/C syntax pass on PHP 8.0–8.5. Audio coverage
includes actual PCM, pause/completion, suspended fades, resource callback
reentry and three PHP refreshes with browser-side processor disconnection.
The allocation fixture waits for SDL's first real Web Audio conversion callback
before taking its baseline; repeated audio-object cycles must restore that
exact SDL count. The full remote matrix and remaining window/input, rendering
and broader device/stress work remain pending.

The audio changes add 21,277 raw bytes (0.041%), 4,237 gzip bytes (0.030%)
and 12,024 Brotli bytes (0.126%) over the cursor pair. Combined JS/Wasm totals
are 51,828,452 raw, 14,000,556 gzip and 9,557,938 Brotli bytes; ICU is unchanged.
`benchmarks/2026-09-21-audio.json` records the matching hashes and identical
compression settings.

Two idle runs of `test/perf/sdl/audio-lifetimes.mjs` measured three batches of
50 unused WAV chunk/music pairs after audio and decoder warmup:

| Runtime | Retained SDL allocations | Live heap increase after 150 pairs | SDL allocations after quit |
| --- | ---: | ---: | ---: |
| Previous cursor build | 2,100 | 7,910,904 bytes | 2,100 |
| Audio ownership build | 0 | 40 bytes | 0 |

The new build's 40-byte increase occurs after the first batch and stays flat.
These are native allocator counts and live dlmalloc bytes; reserved/Wasm
capacity remains reusable and is recorded separately. The fixture measures
ownership of these assets, not mixing throughput or general leak freedom.
Raw samples, browser settings and asset/artifact hashes are recorded in
`benchmarks/2026-09-21-audio-lifetimes-first.json` and
`benchmarks/2026-09-21-audio-lifetimes-second.json`. To repeat it, start the
checkout's `test/browser/server.mjs` harness and run the fixture with
`PHP_VERSION=8.4 LIB_TYPE=static`, the two staged artifact directories and an
output JSON path.

### Window ownership and checked outputs

Window getters such as `SDL_GL_GetCurrentWindow()` reuse the owning PHP
`SDL_Window`, preserving subclasses and keeping the native window alive while
an alias remains. Destroying it invalidates its aliases, renderer, textures,
GL contexts and surface views. Repeated `SDL_DestroyWindow()` calls are harmless;
native queries and operations on a destroyed or uninitialized window raise an Error. Window,
joystick and controller handles reject cloning and serialization. The PHP 8.0
subclass magic-method audit and its fixes are recorded below.

A live window cannot be constructed again. If title coercion calls the
constructor recursively, the outer call fails and preserves the inner window.
A destroyed wrapper may be initialized again. Native window-creation failures
return `null` from `SDL_CreateWindow()` and throw from the constructor, with
SDL's error message. Native dimension clamping is preserved. Embedded NUL
characters in titles raise a ValueError instead of silently truncating the text.

Position, size, display-mode and gamma outputs respect PHP reference types and
stop at the first exception. Size/position outputs are optional, matching their
existing signatures. Property enumeration captures native fields before any
PHP property destructor runs; its title key is the ordinary `title`. Existing
typed aliases remain valid if an assignment is rejected. Display-mode setting
accepts `null` for SDL's default mode and checks the window again after reading
PHP mode properties. Unsupported shaped-window operations retain SDL's native
failure result.

`SDL_UpdateWindowSurfaceRects($window, $rectangles, $count)` checks the count
before allocating and reads only that many rectangles. Omit the count to use
the complete array; an explicit zero performs no update. Negative counts,
counts larger than the array and invalid rectangle values raise exceptions.
The input list is retained across PHP getters, and destroying or reconstructing
the target window during a getter causes an Error before native drawing.

The normal PHP 8.4 static window build passes 91 distinct native SDL browser
cases: twelve window/input ownership cases and all 79 preceding cases. Both
editor smoke tests, nine Make/npm checks and the main-module validator pass;
fresh imports and C syntax pass PHP 8.0–8.5. The window tests cover real renderer
pixels, canonical aliases, constructor and property reentry, typed outputs,
rectangle bounds, input-handle copying and 150 collected window cycles. Exact
SDL allocation counts return to baseline after each batch and reach zero after
final video/SDL shutdown. The full PHP/profile CI matrix and remaining coverage
contract are still pending.

`benchmarks/2026-09-21-windows.json` records the matching JS/Wasm pair and
unchanged ICU. Relative to the audio build, the window changes add 660 raw
bytes (0.0013%), 988 gzip bytes (0.0071%) and 2,300 Brotli bytes (0.0241%).
Combined totals are 51,829,112 raw, 14,001,544 gzip and 9,560,238 Brotli bytes,
using the same compressors for both pairs.


### Window garbage collection

Window collection reports PHP references without refreshing native metadata or
running property destructors during traversal. Ordinary property enumeration
still refreshes the native snapshot. This separates collection from observable
property updates and fixes a PHP 8.0 crash with retained aliases and cycles.
The corrected PHP 8.0 and 8.4 static builds each pass all 101 native SDL cases,
including retained aliases, property-array copies, 150 collected window cycles
and the new GC regressions, with no skips. Both editor smoke tests pass on each
version.

### Native resource serialization

Window, cursor, RWops, surface, pixel buffer, palette, pixel format and GL
context objects remain extensible, but their native handles cannot be serialized
or reconstructed from serialized data. The same denial applies to final font,
chunk, music, joystick and controller objects. Serialize application data such
as asset paths and settings, then create fresh native resources when loading it.
Ordinary SDL rectangles, points and colors remain serializable.

PHP 8.0 now supplies final public `__serialize(): array` and
`__unserialize(array $data): void` guards. Subclasses cannot override these
methods; attempting to do so produces PHP's normal final-method declaration
error. Direct calls and valid serialized object payloads raise catchable
exceptions. Legacy `Serializable` and custom serialized payloads retain their
native denial. PHP 8.1 and newer keep the built-in class flag that rejects
serialization before any user hooks run. Native subclasses' other methods and
properties continue to work normally.

The bypass is reproduced on a fresh PHP 8.0 static baseline for all eight
extensible classes. Six new regression cases fail there before the fix. Fresh
imports/C syntax pass PHP 8.0–8.5, and nine Make/npm checks pass. The corrected
PHP 8.0 and 8.4 static builds each pass 101 native SDL cases, main-module
validation and both editor smoke tests. Warmed payload churn retains exactly
2,687,568 live allocator bytes on PHP 8.0 and 3,399,800 on PHP 8.4 across all
four samples, with zero counted SDL allocations. This measures the tested
payload path, not general leak freedom or throughput.

The matching JS/Wasm comparisons are recorded in
`benchmarks/2026-09-22-serialization-8.0.json` and
`benchmarks/2026-09-22-serialization-8.4.json`. Combined raw/gzip/Brotli changes
are +3,686/+737/+1,859 bytes on PHP 8.0 and +811/+204/−9,990 bytes on PHP 8.4,
using identical compression tools on both sides. ICU is unchanged. The full
PHP/profile CI matrix and the remaining browser API contract are still open.

### Coordinate conversion verification

The normal PHP 8.4 static Make build passes five new native coordinate cases
and both editor smoke tests. The cases verify letterboxed pixels, fractional
viewports, target changes, resizing, checked numeric limits and output callback
safety. A real browser mouse event matches conversion of its window position.
Fresh imports/C syntax pass PHP 8.0–8.5; nine Make/npm checks and main-module
validation pass. All 101 preceding native cases also pass on the new pair,
with zero skips or flaky results: 106 distinct native SDL cases pass in total.
The full PHP/profile matrix remains open.

`benchmarks/2026-09-22-coordinates.json` records +5,171 raw bytes, +1,781 gzip
bytes and −994 Brotli bytes relative to the serialization build, with identical
compression settings on both pairs. ICU is unchanged. These figures measure
binary size, not drawing performance.

### Texture and context restoration verification

Twelve native Chromium cases pass on the normal PHP 8.4 static Make build,
with no skips or flaky results. They cover immutable 2D/cube mip levels,
array/volume sampling and layered framebuffers, compressed image/subimage
pixels, complete pixel-store layouts, packed/integer/float pixels, sampler
filtering and queries, WebGL1 rejection and real browser context restoration.
All 55 compressed formats advertised by this browser accept their exact block
layouts and reject short buffers; PVRTC is not available on this test device.
Unsupported compressed capabilities are tested separately.

The tests exposed SDK integration defects: truncated custom pixel views,
readback sized from unpack state, stale bindings and object names after context
loss, and compressed extensions remaining disabled after restoration. The
Make-linked JS helpers preserve checked byte spans, retire invalidated names,
reset cached bindings and restore automatically enabled extensions. The recovery
case verifies fresh ordinary/compressed texture pixels and multisample resolve
into an array-layer framebuffer with no GL error.

Sampler churn creates and deletes 326 browser objects across 40 context cycles,
then checks three PHP refreshes. No counted sampler remains. Native SDL allocation
counts return exactly to the warmed baseline of three; those allocations are
pinned SDL's main-thread TLS bookkeeping, also present in the old runtime.
This measures the tested ownership paths; broader device and throughput work
and the unchanged full PHP/profile CI matrix remain open.

The same pair passes all 106 preceding native SDL cases: **118 distinct native
cases pass**, with zero skips, failures or flaky results. Both editor smoke tests,
main-module validation and all nine Make/npm checks pass. Fresh OpenGL imports
and C syntax checks pass across PHP 8.0–8.5. The matching pair is installed locally;
the complete remote PHP/profile matrix remains pending.

`benchmarks/2026-09-22-textures.json` records the matching JS/Wasm pair against
the verified coordinate build: +30,080 raw bytes (0.0580%), +6,989 gzip bytes
(0.0499%) and +29,047 Brotli bytes (0.3042%). Combined totals are 51,865,174 raw,
14,010,518 gzip and 9,578,301 Brotli bytes. Both sides use identical compression
tools/settings, and ICU is unchanged. These figures measure size, not throughput.

### Browser input and fullscreen verification

Fourteen native Chromium cases pass on the normal PHP 8.4 static Make build,
with no skips or flaky results. They cover real browser blur/focus (held keys
and modifiers are released), trusted touch motion/cancellation/restart,
fullscreen on canvases with no ID, arbitrary IDs and shadow roots, deferred
activation/cancellation, policy denial, and simulated controller reconnection.
Active and pending fullscreen survive explicit window destruction, video quit
and PHP refresh followed by immediate window/GL context recreation. Dimensions,
viewport and rendered pixels remain correct, with no delayed JavaScript error.

Three active teardown cases fail on the preserved first input build: old
fullscreen restoration overwrites the new canvas size, and a callback after
PHP refresh reads freed native window data. The fix makes the supplied canvas's
style restoration cancellable and runs cleanup before native destruction.
The earlier canvas tests also reproduce the SDK's empty/bare-ID selector bug.
Ordinary canvas dimensions are read directly; the SDK transferred-canvas path
is retained. Browser policy denial now returns -1 before SDL changes flags.
A successful request may still be deferred until a browser gesture.

Fresh imports and window C syntax pass across PHP 8.0–8.5. The actual SDK JS
library link check, style checks, main-module validator and nine Make/npm checks
pass. The same pair passes all 118 preceding native SDL cases: **132 distinct
native cases pass**, with zero skips, failures or flaky results. Both editor
smoke tests also pass. The matching JS/Wasm pair is installed locally.

The text audit against this pair reproduced invalid UTF-8 for some astral
keypresses and missing browser input/composition events. The Unicode follow-up
is recorded below. These are CDP transport probes, not physical OS IME coverage.
Relative mouse mode tracks requested state rather than actual browser pointer
lock; denial and notification behavior still needs verification. Gamepads are
simulated, touch is injected through CDP, and host Chrome was unreachable.
Physical-device coverage and the unchanged full remote matrix remain open.

`benchmarks/2026-09-22-input.json` records +3,017 raw bytes (0.0058%),
+544 gzip bytes (0.0039%) and +1,258 Brotli bytes (0.0131%) versus the accepted
texture/restoration build. Combined totals are 51,868,191 raw, 14,011,062 gzip
and 9,579,559 Brotli bytes. ICU is unchanged, and both pairs use identical
compression tools/settings. These figures measure size, not throughput.

### Browser Unicode and composition verification

The normal PHP 8.4 static Make build passes 36 new native Chromium cases with
no skips or flaky results. Preserved earlier builds reproduce malformed UTF-8
from astral keypresses, missing Unicode/composition events, ignored text-input
requests before window creation, and stale window access after a browser focus
handler destroys or replaces the window being constructed.

Both EditContext and the forced textarea fallback receive complete Unicode,
preserve physical keys, convert UTF-16 selections to codepoints, commit once,
and cancel unfinished composition. Native SDL splits long committed strings
without splitting UTF-8 characters. Explicit start requests survive both
SDL_Init and direct SDL_VideoInit before window creation; stop cancels pending
activation. SDL's implicit initialization call retains ordinary keypress
behavior without opening a browser editing surface.

Tests cover CSS-scaled candidate rectangles in shadow roots, repeated start/stop,
focus preservation, saved/replaced EditContexts, fullscreen input and the
fallback's explicit fullscreen limitation. Window destruction, video shutdown,
SDL_Quit and PHP refresh retire old editing callbacks. Window construction
sets native metadata before focusing the editing surface and checks its owner
generation afterward. A PHP focus handler that destroys or replaces the window
causes a catchable Error; the replacement remains usable and receives its own
Unicode events.

Each transport completes 180 start/stop cycles with zero retained owned editing
listeners. Native SDL allocation counts stay constant, and the final two live
allocator samples agree. These checks cover the tested lifecycle, not general
leak freedom or throughput. Fresh imports and C syntax pass PHP 8.0–8.5;
nine Make/npm checks, style, main-module validation and both editor smoke tests
pass. All 132 preceding native SDL cases also pass: **168 distinct native
cases**, with zero skips, failures or flaky results. Both transports receive
composition and committed text during PHP animation callbacks and while PHP
explicitly awaits the next browser frame through `vrzno_await()`.

The fullscreen-exit fixture now waits for native dimensions after the browser's
asynchronous fullscreenchange event. An eight-cycle probe reproduces the DOM
flag clearing before SDL receives that event; all eight restore their original
size. Three repeat runs of the corrected fixture pass without a native
fullscreen change.

`benchmarks/2026-09-22-text-lifetimes.json` records the final matching pair,
installed together locally. Compared with the accepted input build, it adds
11,911 raw bytes (0.0230%), 3,266 gzip bytes (0.0233%) and 6,442 Brotli bytes
(0.0672%). Totals are 51,880,102 raw, 14,014,328 gzip and 9,586,001 Brotli bytes.
ICU is unchanged, and comparisons use identical compressors/settings. The
intermediate text and ordering records preserve the reproduction builds.
These figures measure size, not throughput.

Pointer-lock rejection and window-cleanup reproductions are addressed in the
verification section below (VO note 71). Physical IME, wider
browsers/devices, broader stress/throughput, Make conformance and the unchanged
full PHP/profile remote matrix also remain open.

### Pointer-lock ownership and error verification

The normal PHP 8.4 static Make build passes 27 pointer-lock cases and all 168
preceding native SDL cases: **195 distinct native Chromium cases**, with no
skips or flaky results in the accepted checks. Both editor smoke tests,
main-module validation, nine Make/npm checks and JS style checks pass. Changed
native C syntax passes PHP 8.0–8.5; the unchanged full remote matrix is pending.

Four permanent regressions reproduce retained lock after window destruction,
silent sandbox denial, and false success without a supported pointer-lock API
or a focused SDL window. Requests now belong to native window IDs and request
generations. Immediate failures return -1; asynchronous denial reports an SDL
error while retaining SDL's requested-mode semantics. Promise rejections are
handled, and legacy error events populate the SDL error before ordinary
application listeners run. Retired requests cannot set a replacement's error.

Tests exercise real lock and relative motion on no-ID/custom-ID/shadow-root
canvases; deferred and active window/video/SDL/request cleanup; browser exit
and click-to-retry; combined fullscreen cleanup; another element's lock;
synchronous, Promise and legacy failures; and late completion before or after
replacement. Late legacy completion releases its observers. Sixty controlled
rejections and window restarts keep SDL allocation counts constant, with equal
final live-allocator samples. This is evidence for these paths, not general
leak freedom or engine-scale throughput.

The first candidate exposed a legacy observer-retention bug and late error
reporting, both covered by permanent failing tests before the correction. A
late-grant fixture now records native acquisition when its Promise resolves:
cleanup can release a retired lock before pointerlockchange dispatches. Gesture
fixtures use actual clicks; the controlled allocation fixture avoids per-click
PHP/JavaScript callback allocations.

`benchmarks/2026-09-22-pointer.json` records the final matching pair installed
locally. Relative to the accepted Unicode/focus build, it adds 5,531 raw bytes
(0.0107%) and 2,526 gzip bytes (0.0180%); Brotli is 1,640 bytes smaller (0.0171%).
Combined totals are 51,885,633 raw, 14,016,854 gzip and 9,584,361 Brotli bytes.
ICU is unchanged; both sides use identical compression tools/settings. The
first-candidate record preserves the intermediate reproduction build.

Focused Linux checks also pass in Firefox 148.0.2 and WebKit 26.4: twelve
existing native cases per browser, 24 total, with no skips, failures or flaky
results. They cover Unicode/physical keys, supplied-canvas lock and motion,
active teardown, competing elements, fullscreen and application error handlers.
WebKit needs a focused window for pointer lock; its headless focus denial is
reported through SDL. Its protocol-injected moves contain zero movement deltas,
so the movement tests use native X11 input under Xvfb. Both browsers pass actual
lock and release, and SDL deltas match the browser's real movement events.

To reproduce these focused checks on Linux, install the repository-pinned
Playwright Firefox/WebKit browsers and their dependencies, plus `xvfb` and
`xdotool`. Build/install a matching `_sdl` JS/Wasm pair through Make and start
the normal harness (`node test/browser/server.mjs`). In another terminal:

```sh
PHP_VERSION=8.4 PHP_VARIANT=_sdl LIB_TYPE=static \
  xvfb-run -a npx playwright test -c test/browser/sdl-platform.config.mjs
```

This supplements the ordinary Chromium suite; it does not replace that suite
or the full PHP/profile matrix. Physical IME, controllers and wider devices,
malformed-asset/stress and throughput checks, Make cache/conformance work and
the full remote CI matrix remain open.
