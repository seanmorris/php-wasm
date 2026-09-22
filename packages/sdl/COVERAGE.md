# Browser SDL/OpenGL completion contract

This tracks VO plan 1281 against the pinned SDL 2.32.10/Emscripten 6.0.6
browser backend. It describes package primitives, not an engine architecture.
An exported function is not considered verified until a test exercises its
native behavior. Implementation and verification status are separate.

## Accepted local baseline

The initial extension/cube delivery is at `84475db`. The subsequent binding
expansion adds events, streaming textures, UTF-8 font rendering/metrics/styles,
controllers, uniform variants and timers. On PHP 8.4 static, 12 native browser
tests and two editor tests pass; nine Make/package checks pass. See
`benchmarks/2026-09-21-bindings.json` for matching artifact hashes and sizes.
The expanded source has not yet passed the complete remote matrix.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| SDL input | Payload roundtrips; real browser keyboard/mouse, Unicode/composition, focus and touch; supplied-canvas fullscreen, policy/deferred requests and teardown; simulated controller reconnect | Physical IME and wider browser/device coverage |
| SDL renderer | Texture update/lock/readback/modulation; array/packed triangles and primitive batches; callback mutation/destruction, renderer state pixel tests and window/logical coordinate conversion | Wider sustained lifetime audit |
| SDL_image | PNG/JPEG/BMP decoding, surface-to-texture paths, explicit PNG short-read rejection and valid-load recovery | Wider device/resource stress and full matrix verification |
| SDL_ttf | UTF-8, styles/outline, metrics, reference-counted initialization, callback safety and native allocation churn | Wider request/profile stress and CI; HarfBuzz remains disabled |
| SDL_mixer | WAV/Ogg/MP3 and real PCM; canonical chunks, bounded channel owners, music completion, pause/fades, suspended replacement, restarts and native allocation churn | Wider device/backend stress, concurrent-playback measurements and full profile/PHP matrix |
| GL shaders/uniforms | Compilation/link diagnostics; signed/float/unsigned uniforms; reflected UBO layouts shared by two programs | Wider stress and full matrix verification |
| GL vertex/index buffers | Checked byte uploads/index ranges; VAOs; integer attributes; instanced array/index draws; range binding and buffer copies; teardown/recreation tests | Broader context-loss/device coverage |
| GL render targets | Color/depth/stencil, MRT and multisample resolve pixels; resize/deletion and sized queries; layered attachment and real browser context restoration | Throughput, wider device coverage and full matrix verification |
| GL state/capabilities | Typed scalar/array queries, blend/stencil/mask/range/offset state, compressed-format and extension enumeration; scalar texture/sampler queries | Remaining backend/device audit and full matrix verification |
| GL textures | Checked complete pixel layouts, immutable 2D/cube/3D/array storage, compressed image/subimage calls and context-owned samplers; twelve native cases with pixel checks | Full remote matrix verification and wider device coverage |
| Native ownership | Renderer/texture/window/controller invalidation; GL cleanup; retained surface/pixel/format/palette owners; safe locks/blits; RWops ownership/callbacks, font/cursor/mixer cleanup; canonical windows, checked outputs and callback reentry | Remaining callback paths, wider device teardown and broader sustained allocation checks |
| Make and packaging | Version/configuration cache isolation, SDL opt-out registration, unchanged and JS-only incremental builds, reproducible arginfo and source package checks | Complete native cold/profile builds and full remote CI matrix |

## Selected rendering API additions

Six native Chromium tests in `test/browser/sdl-engine.spec.mjs` pass on the
normal PHP 8.4.1 static Make build: instancing, uniform blocks/reflection,
unsigned uniforms, depth/stencil/MRT/multisample targets, typed state queries,
and catchable WebGL1 rejection. All 18 native SDL browser tests, two editor
tests and nine Make/npm checks pass for this group. Its matching artifacts
and compressed size comparison are recorded in
`benchmarks/2026-09-21-webgl2.json`. Expanded texture operations are implemented
in `opengl/php_webgl_textures.c`; their later verification is recorded below.
SDL geometry/batch/state bindings are integrated in
`core/php_sdl_geometry.c`. Four native tests pass for array/packed geometry,
all eight primitive batches (including callback mutation/destruction), and
renderer state/capabilities with pixel checks. Packed buffers cover 1/2/4-byte
indices, padded/zero strides, finite values and native allocation limits. The
final candidate passes all 22 native SDL browser tests on PHP 8.4 static.
Two editor smoke tests, nine Make/npm checks and the main-module validator
also pass. The two `benchmarks/2026-09-21-geometry-draw-*.json` records measure
prepared-input rectangle and geometry submission/completion under SwiftShader.
`benchmarks/2026-09-21-geometry.json` records matching JS/Wasm hashes and the
32,400-byte raw / 7,974-byte gzip increase over the WebGL2 group.
They do not establish hardware GPU performance, leak freedom or the remaining
OpenGL throughput requirements.
PHP stubs are the signature source. This local
evidence does not replace the full matrix or the remaining lifetime audit.

Seven GL lifetime tests in `test/browser/sdl-lifetimes.spec.mjs` now pass on
PHP 8.4 static, bringing the native SDL total to 29. They cover construction
and method aliases, explicit/last-reference deletion, window/video teardown,
video subsystem reference counts, renderer-owned contexts, typed output and
destructor callbacks, deleted shader/program names, 40 context allocation
cycles and three request refreshes. Browser instrumentation counts creation
and deletion of all seven exposed GL object types; no counted object remains
after the tested teardown paths. A before-fix probe confirmed that an old GL
buffer previously survived context deletion and recreation. This evidence
does not establish leak freedom for the remaining SDL resource types or for
all browser context-loss/device scenarios. Rectangular matrix setters also
pass catchable WebGL1 rejection checks. Two editor smoke tests, nine Make/npm
checks, PHP 8.0–8.5 C syntax checks and the main-module validator also pass.
`benchmarks/2026-09-21-lifetimes.json` records the matching artifacts: the combined
JS/Wasm pair grows by 1,810 raw bytes, 2,737 gzip bytes and 7,424 Brotli bytes
over the geometry build; ICU remains identical. The unchanged full CI matrix
remains pending.

Ten native tests in `test/browser/sdl-buffers.spec.mjs` pass on a fresh normal
PHP 8.4 static Make build. They verify destination-only and overlapping pixel
conversion, pitch/format/buffer validation, retained and explicitly invalidated
views, palette replacement, 100 collected owner/view cycles, window resize and
video teardown, all five blit variants, RLE locking and uploaded pixels,
property callbacks that destroy native resources, reentrant texture-lock
outputs, typed query outputs and integer/float renderer pixel results. All 39
distinct native SDL tests pass. The conversion test fails against the previous
runtime because conversion changes the source bytes. Fresh SDL imports and C
syntax checks pass across PHP 8.0–8.5; nine Make/npm checks pass. Later RWops,
cursor, font and mixer verification is recorded below.
The same candidate also passes two editor smoke tests and the main-module
validator. `benchmarks/2026-09-21-buffers.json` records +10,621 raw bytes and
+2,308 gzip bytes over the GL lifetime build; Brotli is 4,731 bytes smaller,
and ICU is byte-identical. The matching pair is installed locally. The full
remote matrix is still pending.

| Work item | Selected primitives | Required evidence |
| --- | --- | --- |
| 1284: instancing | `glDrawArraysInstanced`, `glDrawElementsInstanced`, `glVertexAttribDivisor`, `glVertexAttribIPointer` | Different per-instance attributes produce different pixels; indexed and non-indexed paths; invalid offsets/strides/counts |
| 1285: uniform blocks/reflection | `glBindBufferBase`, `glBindBufferRange`, `glGetUniformBlockIndex`, `glUniformBlockBinding`, `glGetActiveUniformBlockiv`, `glGetActiveUniformBlockName`, `glGetUniformIndices`, `glGetActiveUniformsiv`, `glGetActiveUniform`, `glGetActiveAttrib`, `glGetIntegeri_v`, `glGetBufferParameteriv`, `glCopyBufferSubData`, unsigned scalar/vector uniforms | Two programs share/switch real UBO data; reflected layout and names; exact unsigned values; rejected malformed arrays/ranges |
| 1286: render targets | Renderbuffer generation/binding/storage/deletion, multisample storage, `glFramebufferRenderbuffer`, `glFramebufferTextureLayer`, `glBlitFramebuffer`, `glDrawBuffers`, `glReadBuffer`, renderbuffer/attachment/internal-format queries | Depth occlusion, stencil, multiple color outputs, multisample resolve, invalid/incomplete targets and repeated recreation |
| 1287: state/queries | Separate blend functions/equations, blend color, stencil functions/operations/masks, color masks, depth range, polygon offset, line width; typed integer/float/bool state queries, indexed extension strings and object validity | Native state roundtrips and output pixels; array-valued selectors have correctly sized storage; invalid selectors fail before writing |
| 1287: textures | `glTexStorage2D/3D`, `glTexImage3D`, `glTexSubImage3D`, compressed 2D/3D upload/subupload, texture/sampler parameter queries and supported pixel-store layouts | 2D/cube/array/3D sampling, extension-dependent format capability checks, length/alignment/overflow failures |
| 1288: SDL batches | `SDL_RenderGeometry`/`SDL_RenderGeometryRaw`; integer/float point, line, rectangle and filled-rectangle batches; draw color/blend queries; renderer/driver information; viewport, clip, logical size, integer scale, scale and coordinate conversion controls | SDL-rendered pixels, indexed/color/textured batches, clipping/scaling and malformed arrays |

## Safety and platform contract

- PHP byte inputs carry explicit lengths. Vertex/index references are offsets
  in bound GL buffers. Native heap addresses are never accepted from PHP.
- Queries must allocate according to the selector and native result shape.
  No array-producing query may receive scalar-sized output storage.
- Invalid PHP types, sizes, strides and alignment raise catchable exceptions;
  ordinary GL driver failures remain available through `glGetError()`.
- GL names belong to their SDL context. Context loss requires recreating GPU
  resources; the package provides correct bindings, not an engine asset cache.
  The pinned backend supports one live SDL GL context per PHP runtime. Context
  owners release on last-reference cleanup; borrowed aliases invalidate on
  deletion. Renderer contexts must be released by destroying the renderer.
- Browser permissions and gestures govern fullscreen, pointer lock and audio.
  Accurate events and errors are required; engine pause/input policy is not.
- Native desktop window behavior, threads, unavailable haptics/sensors, additional
  codecs and desktop GL/immediate mode are excluded by the browser target.
- Complex-script shaping requires HarfBuzz, which this build deliberately omits.
  UTF-8 transport and glyph rendering do not imply complex-script shaping.
- Whole-runtime slimming and JSPI are separate projects. Keep existing versions,
  Make patterns, `_sdl` opt-outs, codec providers and compatibility import paths.

## Completion evidence still required

Native-backed positive/negative tests for each selected API, resource churn and
context/subsystem restart tests, reproducible binding throughput/memory/size
measurements, npm source payload checks, and the unchanged PHP 8.0–8.5 × three
library-profile CI matrix. Report browser/device coverage limits explicitly.
Update this file as evidence arrives; historical green CI does not verify new
source. Engine scenes, physics, asset caches and gameplay code are out of scope.

### Malformed assets and mixer input cleanup

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
`benchmarks/2026-09-22-malformed-assets.json` preserves before/after evidence.
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


### Rendering and event throughput baseline

Two idle runs against the matching `401f6d9` PHP 8.4 static Make pair now cover
ordinary/instanced indexed and array draws, scalar/array/UBO uniform updates,
GL/SDL texture streaming and 32/1,024-event bursts. Four warmups precede twelve
rotating samples per path. Full framebuffer equality and per-event payload/count
checks pass. `benchmarks/2026-09-22-throughput-first.json` and `-second.json`
retain artifact/fixture hashes, raw samples, software renderer/machine details,
submission/completion times, frame callback execution intervals and native/V8
memory. The package README contains a normalized comparison table.

Native allocations and live bytes plateau during the sampled rounds; graphics
cleanup retains the known three SDL TLS allocations, and event cleanup returns
to zero. This is fixture-specific evidence, not general leak freedom. Indexed
draw submission is costly on this browser; the per-draw buffer queries are a
candidate for further profiling. Some instanced submission samples are below
the SDL clock resolution, and draw/texture timings vary between the two
runs. These shared-host SwiftShader results do not establish hardware GPU or
game FPS limits. All controlled native builds, compression and other tests were
idle during timing. The measurements include the mixer correction. Texture
and uniform cases first render opposite data, and four deliberate driver no-op
probes fail their guards. Concurrent mixer measurements, indexed-query profiling
and wider device coverage remain open.

### Make cache and incremental build verification

The PHP configure cache is now isolated by full version and configure settings.
Real Docker configure checks pass for PHP 8.0 → 8.4 → 8.0 without deleting cache
entries, and for core-only, disabled and restored SDL configurations. Generated
extension registrations and iconv macros match each selection. These configure
checks do not replace complete native cold/profile builds.

A normal PHP 8.4 static build and the incremental verifier pass. An unchanged
build preserves all 1,562 native object files and both runtime artifacts. A
simulated JS-library edit relinks both artifacts with zero C compilations or PHP
reconfigurations. The verifier first reproduced an unnecessary credits-header
rewrite and C compilation; credits generation now runs during configuration.
CI runs the native incremental check in its PHP 8.4 static job and checks all
32 runtime link targets in the fast gate.

The matching pair passes 189 binding cases and all six cube cases in a fresh
worker, plus two editor checks. The fresh worker avoids an earlier test-helper
module-cache mismatch while the staged-artifact loader was being updated.
Sixty Make/npm checks, seven strict declaration cases, 245 demo unit tests and
style checks pass; all four package arginfo headers regenerate identically.
`benchmarks/2026-09-22-make-conformance.json` records these checks. The pair grows
by 32 raw bytes and shrinks by 65 gzip bytes and 581 Brotli bytes; ICU is
unchanged. Matching hashes are in `benchmarks/2026-09-22-make.json`. The full
remote matrix and the wider stress/device work remain open.

### Stream and font ownership verification

The next source group replaces the RWops object layout, guards raw allocations,
owns writable memory independently of PHP strings, retains PHP stream resources,
and shares close/flush helpers with BMP and mixer loaders. It adds file/memory/
custom stream I/O with reentrancy and closed-resource checks. BMP saving copies
pixels before PHP callbacks. Fonts use a weak native registry, honor SDL_ttf's
initialization count and recheck liveness after color getters.

Fresh PECL imports and C syntax pass for PHP 8.0–8.5, and nine Make/npm checks
pass. All ten regressions in `test/browser/sdl-streams.spec.mjs` pass against a
normal PHP 8.4 static Make build. They cover raw allocation traps, memory COW and
range checks, file/memory/temp/custom streams, external and reentrant closure,
BMP snapshots and aliases, original callback exceptions, typed outputs, 100
collected owner cycles and font initialization counts. The churn case requires
SDL allocation counts to return to baseline and bounds live dlmalloc growth
across repeated font/RWops batches; PHP memory accounting is unavailable in this
build. All 39 preceding native tests also pass, bringing the total to 49, and
the main-module validator and both editor smoke tests pass.
Later cursor and mixer verification is recorded below. Wider device behavior and
broader sustained allocation checks remain open. `benchmarks/2026-09-21-streams.json` records +9,261 raw bytes,
+414 gzip bytes and -8,370 Brotli bytes against the preserved surface/buffer pair,
with unchanged ICU. Both `2026-09-21-font-lifetimes-*.json` runs agree: the old
runtime retains 600 SDL allocations and 7,643,664 live bytes after dropping 150
fonts; the new runtime retains zero SDL allocations and a flat 40-byte increase.
See `test/perf/sdl/font-lifetimes.mjs` for the reproducible fixture. This local
evidence does not replace the complete remote CI matrix.

### Cursor ownership implementation

Thirteen cursor/input regressions pass against the final normal PHP 8.4 static
Make build (`test/browser/sdl-cursors.spec.mjs`).
Reproductions against the preserved
surface/buffer runtime (`.cache/sdl-streams/cursor-probe-2.log`) show the bitmap
constructor producing an invalid wrapper, `SDL_ShowCursor(-1)` changing cursor
visibility, and a borrowed current-cursor wrapper becoming stale when the owned
wrapper is collected. The earlier explicit-free alias reproduction has the same
stale-pointer failure. The new alias regression fails against the verified
stream/font build with invalid-object diagnostics. Fresh imports and C syntax
checks pass for PHP 8.0–8.5. Thirteen tests in `sdl-cursors.spec.mjs` cover the
following contracts, canvas CSS/mouse events, constructor callback reentry and
150 collected property cycles:

| API/path | Required contract |
| --- | --- |
| `SDL_Cursor::__construct`, `SDL_CreateCursor` | Correct object offset; checked bitmap sizes and hotspots; failed construction, repeated construction and cleanup are safe |
| `SDL_CreateSystemCursor`, `SDL_CreateColorCursor` | Checked identifiers/hotspots and live surface ownership; real native failures remain visible |
| `SDL_GetCursor`, `SDL_GetDefaultCursor` | Retain/reuse the live owner when available; distinguish the library's default cursor from an owned cursor |
| `SDL_FreeCursor`, last-reference cleanup | Invalidate every wrapper for a freed native cursor; repeated frees are harmless; preserve the native default cursor |
| Video quit/reinitialization and request shutdown | Invalidate native cursor wrappers when the final video subsystem reference is released; intermediate quit calls leave them usable |
| Clone/serialization | Reject duplication of native cursor ownership |
| `SDL_SetCursor` | Reject stale wrappers; support native nullable redraw semantics |
| `SDL_ShowCursor` | Accept `SDL_QUERY`, `SDL_DISABLE`, `SDL_ENABLE`; preserve the pinned SDL implementation's integer return value (the previous visibility state for a change) |
| Mouse state output references | Respect typed references and stop after an output exception |

The pinned Emscripten backend sets canvas CSS for cursors, does not implement
mouse warping, and may defer pointer-lock requests until a browser gesture.
Relative-mode/focus/gesture outcomes remain part of the browser input task;
this audit does not claim those paths are verified.

### Mixer reproductions before the audio corrections

The stream/font native build still reproduces mixer lifetime defects: a new
`Mix_GetChunk()` after explicit free revives a native pointer; unused chunks
and music remain retained by request registries; serialization produces native
wrappers without a live payload; `Mix_QuerySpec()` writes later outputs after a
typed-reference exception. Freeing fading music while browser audio is suspended
did not return within the 2.5-second probe, even with a 100 ms fade. Final SDL
audio shutdown also leaves the mixer reporting an open device. VO note 59
records the probes and native-source findings. The corrections and current
verification status are recorded in the mixer section below.

The first candidate passed eight cursor tests and all 49 existing SDL tests.
Real mouse input exposed a separate integration bug: the backend rendered on
`Module.canvas` but registered events against a DOM element named `canvas`.
Native position remained (0,0) on a canvas without that ID; adding the ID made
it track real mouse movement. The candidate now binds SDL's default event target
to the supplied canvas through a Make-linked JS library, preserving DOM IDs and
module isolation. Native tests pass with no ID, a custom ID alongside another
`#canvas`, and a shadow root. The second normal Make build passes all thirteen
new tests; the first candidate failed the real mouse and pre-video allocation
regressions.

The cursor allocation test accounts for a pinned SDL 2.32.10 diagnostic defect:
the Emscripten backend allocates its custom cursor URL through raw `_malloc`
and releases it with `SDL_free`, so `SDL_GetNumAllocations()` decreases by one
for each freed custom cursor. A preserved-runtime probe shows a -10 count after
each ten create/free cycles while live dlmalloc bytes remain flat. The regression
checks the known adjusted count, collected PHP references and bounded live heap;
it does not treat that raw negative drift as freed memory or general leak freedom.

A cursor created before any video driver uses SDL's software fallback. The first
candidate invalidated its PHP wrapper at video initialization without freeing
the native allocation: twenty such cursors left twenty allocations after final
`SDL_Quit()`. The updated teardown hook closes owned cursors before invalidating
wrappers, including when no native video driver exists. The new regression
fails against the preserved first candidate with twenty retained allocations
and passes against the final build with zero.

The PHP 8.0 subclass magic serialization bypass reported in VO note 61 is
fixed and verified below. Broader input/device behavior and the remote
PHP/profile matrix remain required.

Final cursor/input verification: the normal second Make build passes all
thirteen new tests and all 49 preceding native SDL tests (62 distinct cases).
The mouse case was then extended to require accumulated relative deltas and
read/reset behavior, and passes again. Both editor smoke tests, all nine
Make/npm checks, the main-module validator and six-version fresh-import/C
syntax checks pass. `benchmarks/2026-09-21-cursors.json` records +3,062 raw,
+1,069 gzip and +5,323 Brotli bytes versus the stream/font pair, with unchanged
ICU. The final matching pair is installed together in `packages/php-wasm`.
The full remote matrix and the remaining contract above are still open.

The cursor pair had one further startup defect: selecting a
software cursor before a video driver exists, freeing it, then calling
`SDL_GetCursor()` revives a wrapper because the native current cursor does not
reset when its default is null. The final-pair probe records
`{video:false,revived:true}` in `.cache/sdl-cursors/pre-video-selection.log`.
The audio source batch adds checked pre-video selection/getter behavior and a
regression for this case.

### Mixer lifetime verification

Package-local mixer overlays replace duplicated patch sections. Weak native
registries release unused chunks/music, bounded channel references retain the
last association, and current music stays alive until playback ends. Completed
music collects at PHP mixer boundaries. Explicit free cancels only that music's
playback; replacement cancels the old fade to avoid suspended-audio waits.
Final close, format changes, SDL audio teardown and request refresh invalidate
remaining objects and close every native mixer reference. Decoder unload releases
music. Tables detach before PHP destructors and teardown guards reopening.
WAV input joins music in snapshotting PHP streams before native decoding.
Queries stop after exceptions, audio objects reject serialization and default
device selection accepts null. Zero/default audio settings and negative volume
and channel-count queries preserve native behavior. Regenerated PHP 8.0-compatible
arginfo corrects Mix_SetError/Mix_ClearError signatures.

A small patch to pinned SDL_mixer adds channel allocation overflow/failure checks,
clears freed channel pointers, corrects its group upper bound, handles empty or
fully reserved channels and widens volume/fade arithmetic. Make reapplies it to
a fresh extraction when the patch changes;
versions/providers are unchanged. Pre-video cursor selection now raises an
Error, and getters return null until video exists.

The prior mixer probes reproduce against the verified cursor pair
(`.cache/sdl-audio/baseline.log`); new ownership and output regressions fail there.
Fresh imports/C syntax pass PHP 8.0–8.5 and nine Make/npm checks pass. The normal
PHP 8.4 static Make build passes all sixteen audio regressions, all fourteen
cursor regressions and the preceding 49 native SDL tests: 79 distinct cases.
Both editor smoke tests and the main-module validator pass. The audio tests
include real PCM, completed
music whose destructor starts a replacement, suspended fades, three PHP refreshes
with multiple mixer opens, and browser-side processor disconnection. The churn
fixture waits for the first real Web Audio callback before sampling: SDL lazily
allocates its conversion work buffer there. Exact SDL allocation counts must
then return to baseline; the check does not allow unexplained count drift.

This does not complete the lifetime or input/audio work. That audio pair still
reproduces window clone/serialization acceptance, leaked repeated construction,
typed-output corruption and rejected valid subclasses (VO note 64). The window
follow-up is recorded below. PHP 8.0 subclass serialization, broader device/
context behavior, remaining render/texture APIs, performance/stress and the full
matrix remain open.


`benchmarks/2026-09-21-audio.json` records +21,277 raw, +4,237 gzip and +12,024
Brotli bytes versus the cursor pair, with unchanged ICU. Both idle
`2026-09-21-audio-lifetimes-*.json` runs agree: after dropping 150 unused WAV
chunk/music pairs, the old build retains 2,100 SDL allocations and 7,910,904
live bytes; the new build retains zero SDL allocations and a flat 40-byte
increase. Final audio/SDL quit leaves zero counted SDL allocations in the new
build and 2,100 in the old one. This fixture verifies these audio assets' native
ownership, not mixing throughput or other resources. The matching audio pair is
installed together in `packages/php-wasm`.

### Window ownership verification

The next package-local window overlay preserves renderer/context/surface teardown
while canonicalizing window aliases, accepting valid subclasses and rejecting
native ownership copies and constructor reentry. Property enumeration snapshots
native data before PHP property destructors run; output assignments preserve
typed references and original exceptions. Rectangle updates validate the requested
count, retain an input-array snapshot and detect window destruction/reconstruction
across getters. An explicit zero count is a no-op; an omitted count uses the
array length. Display-mode input supports native null defaults and rechecks the
window after property callbacks. Closed-window use raises a catchable Error;
explicit destruction is idempotent. Joystick/controller objects now also reject
serialization.

Fresh imports and C syntax checks pass for PHP 8.0–8.5; nine Make/npm checks pass.
All twelve new native browser cases pass on the normal PHP 8.4 static Make build
and are included in the normal test selection. Both editor smoke tests and
main-module validation pass. Cases include 150 collected native-window cycles,
subsystem reference counts/restarts, original destructor exceptions and native
failure results. The first run's only failure was a fixture that expected SDL to
reject small dimensions; SDL clamps them to one. The corrected fixture verifies
that clamp and actual failure from conflicting native graphics flags.
Baseline probes reproduce constructor coercion overwriting the inner native
window, typed-output corruption and accepted input-handle serialization. The
same pair passes all 79 preceding SDL tests, bringing the total to 91 distinct
native cases. The PHP 8.0 extensible-class serialization follow-up is recorded below. The rest of
the root contract remain open.

`benchmarks/2026-09-21-windows.json` records the matching JS/Wasm pair and
unchanged ICU. Relative to the audio build, the window changes add 660 raw
bytes (0.0013%), 988 gzip bytes (0.0071%) and 2,300 Brotli bytes (0.0241%).
Combined totals are 51,829,112 raw, 14,001,544 gzip and 9,560,238 Brotli bytes,
using the same compressors for both pairs.


### PHP 8.0 serialization conformance and window GC

A fresh normal PHP 8.0 static build reproduces subclass magic-method bypasses
for all eight extensible selected resource classes. The original classes reject
ordinary serialization, but PHP 8.0 checks user `__serialize`/`__unserialize`
methods before the legacy native callbacks. Restored wrappers have no native
payload; the reproduction does not establish restoration of a stale pointer.
Six new regression cases fail against that baseline; value-object serialization
and the existing Serializable restriction pass.

The shared helper in `core/php_sdl_extra.c` preserves the PHP 8.1+ class flag and
adds final public magic guards alongside the legacy PHP 8.0 callbacks. Thirteen
selected resource classes share it, with checked MINIT registration results.
Eight new browser cases cover both wire formats, native subclass use after
rejection, final font/audio/input objects, legacy hooks, magic overrides,
Serializable, value objects and payload churn.

Broader validation exposes two existing PHP 8.0 window GC crashes, reproduced
before serialization changes. Zend's ordinary GC invokes the custom window
property enumerator, which refreshes native fields and can execute PHP
destructors while the graph is being collected. A new regression also fails on
the preserved PHP 8.4 pair: collection prematurely destroys a live title property.
The window now has a GC handler that reports references without refreshing
metadata, including PHP 8.0's standard shared-property-table handling. Two new
cases cover that separation, property-array aliases and declared/dynamic cycles.

The final normal PHP 8.0 and 8.4 static Make builds each pass 101 native SDL
cases with no skips. Both editor smoke tests and main-module validation pass
on each version. Fresh imports/C syntax pass PHP 8.0–8.5; nine Make/npm checks
pass. The matching JS/Wasm pairs are preserved and installed locally. The PHP
8.4 iconv implementation/version and a real UTF-16 conversion match its baseline.

After warming the identical payload path, all four live allocator samples are
2,687,568 bytes on PHP 8.0 and 3,399,800 on PHP 8.4; counted SDL allocations stay
zero. These checks establish no growth for the tested path, not general leak
freedom or throughput. Size records use the same compression settings for both
sides and verify unchanged ICU:

| Version | Baseline | Raw delta | Gzip delta | Brotli delta | Record |
| --- | --- | ---: | ---: | ---: | --- |
| PHP 8.0 | Fresh pre-serialization static build | +3,686 | +737 | +1,859 | `benchmarks/2026-09-22-serialization-8.0.json` |
| PHP 8.4 | Verified window build | +811 | +204 | −9,990 | `benchmarks/2026-09-22-serialization-8.4.json` |

Cross-version local configure caching exposed incompatible iconv cache values;
only the stale generated cache entry was cleared before the successful build.
A permanent Make cache-isolation fix remains under VO 1292. Later texture and
render-target verification is recorded below. The unchanged full remote
PHP/profile matrix, browser/device input coverage and broader performance/stress
contract remain open.

### Renderer coordinate conversion

The package now binds both `SDL_RenderWindowToLogical` and
`SDL_RenderLogicalToWindow` with native output types and void returns. They
use SDL's live viewport/scale/target transform, including fractional viewport
offsets. Inputs are checked before conversion; output references are retained
through destructive callbacks, and assignment stops on the first exception.

The pinned SDL reverse conversion multiplies float32 values, adds a double
viewport, then casts its float result to int32. The binding checks intermediate
multiplication and probes inverse bounds before that cast. It leaves margins
for float32 rounding and rejects indistinguishable or nonfinite bounds.
This conservative check can reject extreme coordinates still inside int32;
normal SDL truncation is retained for accepted inputs.

Fresh imports and C syntax pass PHP 8.0–8.5. Four initial browser cases fail
on the preceding runtime because the bindings are absent. Five native cases
now pass, covering real letterboxed pixels, integer/nonuniform scale, fractional
viewports, target switches, resize, numeric failures, typed references, alias
outputs and renderer destruction during output callbacks. An actual browser
mouse event agrees with conversion of its original window coordinates. A host sanitizer probe uses the actual
pinned SDL conversion functions: five million generated transforms complete
with 1,568,408 accepted conversions and no undefined float-to-int casts after
adding the intermediate-product check. This is supplemental arithmetic
coverage, not browser/native verification or throughput evidence.

The normal PHP 8.4 static Make build succeeded. All five new native cases,
both editor smoke tests, the main-module validator and nine Make/npm checks
pass. The first numeric fixture expected a plain Error for a closed resource;
Zend correctly raises TypeError, and the corrected assertion passes without a
native code change. All 101 preceding native cases also pass, with zero skips,
failures or flaky results: 106 distinct native SDL cases pass in total. The
full PHP/profile CI matrix remains open.

`benchmarks/2026-09-22-coordinates.json` records the matching pair: +5,171 raw
bytes (0.0100%), +1,781 gzip bytes (0.0127%) and −994 Brotli bytes (−0.0104%)
versus the serialization build. Totals are 51,835,094 raw, 14,003,529 gzip and
9,549,254 Brotli bytes, with unchanged ICU and identical compression settings.
These are size measurements, not timing or throughput results.

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
