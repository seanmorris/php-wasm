---
title: SDL and OpenGL
---
<!--
Vendored from php-wasm-site commit e7dea4386c6099cfc1c0e510e636bb09ec051426
Source: https://github.com/seanmorris/php-wasm-site/blob/e7dea4386c6099cfc1c0e510e636bb09ec051426/pages/extensions/sdl.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/test/browser/sdl.spec.mjs
- https://github.com/seanmorris/php-wasm/blob/d075a2c74dcacfd1344c46a8b5279ee917cf37b9/test/build/sdl.test.mjs
-->
# SDL and OpenGL

The standalone `php-sdl-wasm` package includes SDL2, SDL_image, SDL_mixer,
SDL_ttf and OpenGL shader bindings. It supports PHP 8.0–8.5 with static, shared
and dynamic library profiles. Each versioned entry includes its matching
runtime and required native libraries. SDL PHP bindings are built into that
runtime. Neither `php-sdl-wasm` nor `php-wasm` depends on the other package.

To see it running, open the **SDL Cube** demo in the
[embedded PHP editor](/demos.html#sdl-cube-and-sdl-sine), or follow
[Run the textured cube](#run-the-textured-cube) to use it on your own page.

## Select the runtime and canvas

Create a canvas before constructing `PhpSdl`. This example assumes a bundler:

```html
<canvas id="sdl" width="640" height="480" tabindex="0"
    style="image-rendering: pixelated"></canvas>
```

```javascript
import {PhpSdl} from 'php-sdl-wasm/php8.4-sdl.mjs';

const php = new PhpSdl({
    canvas: document.querySelector('#sdl'),
});

php.addEventListener('output', event => console.log(...event.detail));
php.addEventListener('error', event => console.error(...event.detail));

await php.run(`<?php
    var_dump(function_exists('SDL_Init'), function_exists('glCreateShader'));
`);
```

Serve all generated package files together. The versioned entry loads any
shared codec libraries and preload data required by its build. You do not
need separate GD or zlib packages just to start SDL. Additional PHP extensions
can still be supplied through `sharedLibs`.

Replace `new PhpWeb({version, variant: '_sdl', ...options})` with
`new PhpSdl(options)` using the corresponding versioned import. Nonempty
`variant` options now report a migration error. The former `php-wasm-sdl`
shim's empty `getLibs()` API is replaced by the dedicated runtime package.

## Build options

Use the existing Make targets in the php-wasm checkout:

```sh
make sdl-mjs

# Keep only core SDL:
make sdl-mjs \
    WITH_SDL_IMAGE=0 WITH_SDL_MIXER=0 \
    WITH_SDL_TTF=0 WITH_OPENGL=0
```

The same flags can be set in [`.php-wasm-rc`](/compiling/php-wasm-rc.html#sdl-runtime-options)
for `php-wasm-builder build sdl mjs` (`php-wasm-builder` 0.2.0 or later).
Both commands produce `packages/php-sdl-wasm` with its matching native runtime,
required libraries, and preload data. In a source checkout, `SDL_OUTPUT_DIR`
can override the destination; raw native outputs stay in `.cache/sdl-raw/php<version>`.

| Flag | Default | Included support |
| --- | --- | --- |
| `WITH_SDL` | `0` normally; enabled by the SDL target | Compiles SDL bindings into the runtime; `dynamic` is a legacy alias for `1` |
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

The internal `_sdl` filename/configuration suffix separates native outputs and
configure caches. JavaScript consumers select SDL through the `PhpSdl` import.

PHP configure caches are separated by full PHP version and effective configure
arguments under `.cache/php-configure/`. Changing add-on flags reconfigures PHP;
repeating the same settings preserves the configuration timestamp. `make
php-clean` removes the selected PHP version's caches, and `make clean` removes
all configure caches. Switching PHP versions does not require editing cached
iconv results.

The package's browser integration files in `js/` are Emscripten link inputs.
Editing one relinks the selected runtime without rerunning PHP configure or
recompiling unchanged C sources. Use `make sdl-mjs` to refresh the package and
keep all its generated files together.

After building, verify incremental behavior from the checkout with:

```sh
ENV_FILE=.github/.env_8.4.static.ci node .github/bin/verify-sdl-incremental.mjs 8.4
```

Use the same `ENV_FILE` as the build. The verifier requires an unchanged build
to preserve both native objects and output timestamps, then uses Make's `-W`
option to simulate an updated JS library and require a relink with no C changes.
CI runs this check in the PHP 8.4 static job.

After a local native rebuild, restart Vite with `--force` and reload the demo.
Vite can retain the previous generated JavaScript while serving the new Wasm;
both files must come from the same build.

## Input, textures, fonts and timing

`php-sdl-wasm` includes the bindings below.

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

Browser keyboard events reach SDL only while its canvas or owned IME field has
focus. Other page controls retain normal typing, shortcuts and navigation;
leaving the SDL input target releases held keys and modifiers so they cannot
stick when focus moves into an editor. Returning to the canvas resumes input.

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
`SDL_GameControllerAddMapping()` changes SDL's mapping database. When creating
a device-specific entry from the browser's default mapping, close and reopen
the controller once to select that entry. Subsequent edits to that same entry
update its open controller handle. Browser gamepads expose their hats as
buttons; `SDL_JoystickNumHats()` is zero on this backend.
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

### Canvas keyboard focus

Browser key forwarding requires focus on the supplied canvas or its
owned IME transport. Other editors receive normal typing and shortcuts.
Leaving that target releases native held keys and modifiers after DOM focus
settles, without interrupting a move between the canvas and its IME field.

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
so these bindings do not add complex-script shaping.

Unsigned timers and 64-bit touch IDs return integers when they fit PHP's integer
range, otherwise exact decimal strings. PHP-Wasm has 32-bit PHP integers; cast
to float for ordinary elapsed-time calculations and retain strings for exact
counter/identifier values. Counter units come from
`SDL_GetPerformanceFrequency()`; ticks are milliseconds.

Desktop window management, threads, haptics, sensors and additional codecs
remain outside this build. The browser/Emscripten backend still determines
which native features can produce events.

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
`packages/php-sdl-wasm/core/php_sdl_geometry.stub.php` in the source checkout for exact argument and
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

## Graphics APIs and cleanup

Create an SDL OpenGL ES 3 context before calling the GL bindings. The browser
API supports shaders, programs, uniforms, buffers, vertex arrays, instancing,
integer attributes, uniform blocks/reflection, textures, depth/stencil and
multisample renderbuffers, multiple framebuffer outputs, and pixel readback.
Desktop immediate-mode functions such
as `glBegin()` are not provided. Use `packages/php-sdl-wasm/opengl/php_webgl.stub.php`
and the buffer, texture, and matrix rules in `packages/php-sdl-wasm/README.md` from the
same checkout when porting desktop code. Invalid sizes and offsets raise exceptions before
native memory access; GL driver errors are available through `glGetError()`.

Instanced draws use the same checked buffer-relative offsets as ordinary
draws. Integer attributes retain their integer values. Uniform-buffer range
offsets must satisfy `GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT` and fit the allocated
buffer; use the reflected block size, offsets and array/matrix strides to
construct its bytes. Unsigned `ui`/`uiv` uniforms accept exact decimal strings
up to `4294967295`, including values beyond PHP-Wasm's signed integer range.
Missing uniform/block names return `GL_INVALID_INDEX` (`-1`).

`glGetIntegerv()`, `glGetFloatv()` and `glGetBooleanv()` return scalar or array
values according to the selector. A viewport produces four integers; a color
write mask produces four booleans. Unknown selectors raise an exception. Query
the context's extensions and supported sample counts before choosing formats;
constant availability does not establish backend support. Multisample color
must be resolved with `glBlitFramebuffer()` before sampling or readback.
Depth/stencil blits require `GL_NEAREST`.

`glTexStorage2D()`/`glTexStorage3D()` allocate immutable mip storage for 2D,
cube, array and volume textures. The 3D image/subimage calls take packed bytes.
Pixel transfers check alignment, row lengths and skipped rows/pixels; 3D uploads
also account for image height and skipped images. Required lengths include
prefixes and padding. Surface uploads reset and restore unpack layout, while
readback zeroes unused bytes. These byte-string APIs reject bound pixel buffers.
Null image allocation has no source layout; float32 depth/stencil accepts only
that allocation form in WebGL.

Compressed image/subimage calls take an explicit `imageSize`, checked against
the format's block geometry and supplied bytes. Query
`glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS)` before choosing a format;
unsupported formats raise `ValueError`. The binding checks S3TC, ETC1,
ETC2/EAC, RGTC, BPTC, 2D ASTC and PVRTC1 layouts. The native browser still
validates target/mip/block-offset restrictions. WebGL2 array support does not
imply support for compressed volume textures.

Texture and sampler parameter queries return scalar integers or floats.
Sampler generation, binding, integer/float setters and deletion let a texture
unit override its texture's sampling state. Samplers follow the same context
ownership and checked output-reference behavior as the other GL objects.

New WebGL2 operations reject a WebGL1 context with a catchable PHP error.

Image, font, and audio loaders return `null` on native load failures. Check
`SDL_GetError()`. Free surfaces with `SDL_FreeSurface()`, close fonts with
`TTF_CloseFont()`, and release audio with `Mix_FreeChunk()` / `Mix_FreeMusic()`.
Freed audio/font objects cannot be reused. Release GL resources when they are
no longer needed; context teardown also deletes remaining PHP-created buffers,
textures, samplers, vertex arrays, framebuffers, renderbuffers, shaders and programs.

Keep the owning object returned by `SDL_GL_CreateContext()`,
`$window->GL_CreateContext()` or `new SDL_GLContext($window)` while using it.
Dropping the last reference deletes the native context.
`SDL_GL_GetCurrentContext()` returns a borrowed alias. Deleting a context
invalidates every alias, and repeated deletion is harmless. Using a destroyed
context, cloning it or serializing it raises a catchable exception.
`SDL_GL_MakeCurrent(null, null)` unbinds a live context without deleting it.

The pinned browser backend supports one live SDL GL context per PHP runtime.
Close it before creating another context or renderer, including when the old
context is unbound. A renderer owns its GL context; destroy the renderer to release it.
Window destruction, video reinitialization, the last video subsystem quit and
`SDL_Quit()` invalidate related aliases and release GL allocations. Earlier
subsystem quits preserve the context if video still has another reference.
Browser context loss invalidates GPU resources. After `webglcontextrestored`,
recreate them and reapply render state; deleting the old names is harmless.
The binding resets cached SDK bindings and restores automatically enabled
extensions. It does not retain or reload your assets.
GL generation functions also clean up after typed-output errors or destructor
callbacks that destroy the context during output assignment. Deleted shader
and program names raise `ValueError` in operations that require a live object.

After halting playback and freeing music/chunks, call `Mix_CloseAudio()` and
`Mix_Quit()` to close the device and unload initialized decoders. The cube also
performs this cleanup when audio setup fails, before offering a retry.

With this package's implicit SDL Asyncify sleeps disabled, `SDL_Delay()` blocks
the browser; it does not yield a game loop. A PHP loop can explicitly await a
JavaScript frame Promise through `vrzno_await()`.
Schedule frames with the browser's `requestAnimationFrame`. SDL buffer swaps
stay synchronous inside Vrzno animation callbacks. Register idempotent cleanup
in `vrzno_env('onRefresh')` to cancel frames, remove listeners, stop audio, and
release native resources before PHP request memory resets. The cube also cleans
up on rerun, errors, and page exit. Use a fresh canvas when replacing a runtime
or switching graphics context types.

## Resource ownership and lifetimes

PHP objects own their native SDL resources. The rules below describe when
those resources are released, which aliases stay valid, and which errors are
catchable.

### RWops and fonts

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

Fonts release their native storage on `TTF_CloseFont()`, last-reference cleanup,
or the final `TTF_Quit()`. If SDL_ttf was initialized more than once, intermediate
quit calls leave fonts usable. Font cloning and serialization are rejected.
Color getters may execute PHP, so text rendering rechecks font liveness after
reading them. Metrics stop assigning output parameters on the first exception.
`TTF_SetFontSize($font, $size)` accepts sizes 1–4096 and updates later metrics
and rendered glyphs. Family/style queries return nullable strings, face counts
return integers, and `TTF_FontFaceIsFixedWidth()` returns a native integer flag:
test it for nonzero rather than comparing it with `1`.

### Cursors and mouse queries

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
returns the **previous** visibility.
Mouse state outputs honor typed references and stop at the first exception.

SDL's default event target follows the canvas supplied to `PhpSdl`, including
canvases with custom IDs and those inside a shadow root. Its DOM ID is preserved;
another element named `canvas` does not redirect mouse callbacks.

The browser backend displays cursors through the canvas CSS. It does not
support mouse warping: `SDL_WarpMouseInWindow()`/`$window->WarpMouse()` leave
that native limitation visible through `SDL_GetError()`. Pointer lock and
relative motion still depend on browser gestures and focus; the cursor fixes
do not add automatic permission or gesture handling.

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

Closing an already closed mixer or halting music without an open device is
harmless and preserves the existing SDL error. Final close clears the decoder's
old audio format. Calling `Mix_Init()` while closed loads codec support without
opening audio or activating decoder lists; `Mix_QuerySpec()` stays zero until
another successful open. PHP refresh after explicit audio/SDL shutdown leaves
no counted SDL allocations in the tested paths. Use `Mix_OpenAudioDevice()`
with `allowedChanges` set to `0` when an exact sample rate/channel layout is
required; `Mix_OpenAudio()` permits native frequency/channel negotiation.

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

### Window garbage collection

Window collection reports PHP references without refreshing native metadata or
running property destructors during traversal. Ordinary property enumeration
still refreshes the native snapshot. This separates collection from observable
property updates and fixes a PHP 8.0 crash with retained aliases and cycles.

### Native resource serialization

Window, cursor, RWops, surface, pixel buffer, palette, pixel format and GL
context objects remain extensible, but their native handles cannot be serialized
or reconstructed from serialized data. The same denial applies to final font,
chunk, music, joystick and controller objects. Serialize application data such
as asset paths and settings, then create fresh native resources when loading it.
Ordinary SDL rectangles, points and colors remain serializable.

On PHP 8.0, these classes supply final public `__serialize(): array` and
`__unserialize(array $data): void` guards. Subclasses cannot override these
methods; attempting to do so produces PHP's normal final-method declaration
error. Direct calls and valid serialized object payloads raise catchable
exceptions. Legacy `Serializable` and custom serialized payloads retain their
native denial. PHP 8.1 and newer keep the built-in class flag that rejects
serialization before any user hooks run. Native subclasses' other methods and
properties continue to work normally.

### Malformed PNG input

A PNG that ends early, whether in its header, image data or CRC, fails with a
libpng read error. The loader releases its decoder and surface state and
returns null with an SDL error, and later valid images load normally.

## Run the textured cube

Select **SDL Cube** in the embedded PHP editor. It renders a rotating
perspective cube using `sean-icon-32.png`, a TrueType text scroller, looping MP3 music, and a WAV sound effect. Four messages
stream in from left to right with a sine wave through the individual letters,
pause in reading order, then leave to the right. Their bold cyan/white/sand
lettering and black outline sit over the spinning cube. Edit the example's
`MESSAGES` array to change the text; long messages wrap to fit the canvas.
Glyphs, gradient and outline are baked into one cached texture atlas.
`SPIN_SPEED` and `KEYBOARD_SPEED` control automatic and manual rotation. The track is
**Unreal Superhero 3** by **Kenët and rez**, credited from the supplied
`WOJTEK3.mp3` ID3 tags. The texture
uses `GL_NEAREST` without mipmaps, and the canvas uses pixelated scaling.
**SDL Sine** remains available as the smaller original example.

The cube canvas fills the editor's preview box. It updates its drawing buffer,
viewport, perspective, and text overlay when the box changes size, preserving
the cube's proportions in landscape and portrait layouts. Cleanup disconnects
its resize observer.

The cube requires WebGL2. Click **Enable audio** to satisfy the browser's user
gesture requirement, then focus the canvas for keyboard input:

| Control | Action |
| --- | --- |
| Arrows / WASD | Rotate the cube |
| Space | Pause or resume rotation and text |
| R | Reset rotation and restart the first message |
| M | Mute or resume enabled audio |
| Escape | Stop the demo |

Audio pauses when focus leaves the canvas. **Run** restarts a stopped demo;
**Refresh** releases its native resources. Graphics context loss pauses
rendering, and restoration rebuilds the GL resources.

For your own page, use `demo-web/public/scripts/sdl-cube.php` and its asset
loader, `demo-web/src/lib/sdlAssets.js`, from the php-wasm release that
matches your runtime. Before running the cube, stage these files under
`/preload/sdl` in PHP's virtual filesystem:

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

## Development notes

Test coverage, size measurements, performance baselines and per-change
verification records are maintained with the package source. See the
[`php-sdl-wasm` README](https://github.com/seanmorris/php-wasm/blob/develop/packages/php-sdl-wasm/README.md)
and [coverage record](https://github.com/seanmorris/php-wasm/blob/develop/packages/php-sdl-wasm/COVERAGE.md),
including the manual device checks that remain unverified.
