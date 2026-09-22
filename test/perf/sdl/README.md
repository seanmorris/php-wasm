# SDL drawing measurements

Build matching JS/Wasm through Make, with `WITH_SDL=1`, and copy the pair to
`packages/php-wasm`. Start the ordinary browser harness from the repository
root with `node test/browser/server.mjs`. With other builds and browser tests
idle, run twice into different output files:

```sh
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/run.mjs .cache/sdl-draw-first.json
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/run.mjs .cache/sdl-draw-second.json
```

The benchmark compares 1,024 individual rectangle calls, one rectangle batch,
indexed geometry arrays and packed geometry. It prebuilds all inputs, warms
each path, rotates the order, and records all 12 samples per case. Submission
time includes PHP/native calls and SDL queueing. A one-pixel readback verifies
rendering and measures completion separately. Each sample repeats 64 batches
to exceed the SDL clock's millisecond granularity. Medians are normalized per
1,024 rectangles; completion cost is amortized across the 64 batches. This is
neither a pure binding microbenchmark nor a prediction of game FPS.

The runner uses the same SwiftShader flags as the SDL browser tests. The report
includes the actual SDL/WebGL renderer, browser/PHP versions, library profile,
artifact hashes, PHP memory and Wasm heap capacity. Retained samples
and allocator caches affect memory figures; these short runs do not establish
long-running leak freedom. Zero PHP memory readings indicate unavailable Zend
allocator accounting. Do not use hardware-independent timing thresholds in CI.

For compressed sizes, use `packages/sdl/benchmarks/measure-size.mjs` with a
previous measurement JSON, the preserved matching baseline artifact directory,
the candidate artifact directory (including `php.data`), the output JSON, and
a change description. It verifies the baseline hashes and recompresses both
sides with the same Node/zlib settings.

For the font ownership regression, preserve both builds and use a fresh browser
page for each. With builds, compression and other tests idle, run:

```sh
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/font-lifetimes.mjs \
  .cache/sdl-buffers/runtime .cache/sdl-streams/runtime .cache/sdl-font-lifetimes.json
```

This records three batches of 50 fonts released by dropping PHP references,
then final SDL_ttf shutdown. It includes artifact/font hashes, SDL allocation
counts, live dlmalloc bytes, reserved allocator space and Wasm capacity. Live
bytes come from the pinned SDK's `mallinfo`, because this build reports zero
from PHP's `memory_get_usage()`. Reserved space may remain reusable after free;
do not interpret it as a count of live allocations. This fixture establishes
font lifetime behavior and does not measure drawing throughput or other resources.

## Rendering and event throughput

The broader runner takes an explicit matching native artifact directory. Start
the same browser harness, leave builds/compression/other tests idle, and run it
twice with separate output paths (existing reports are never overwritten):

```sh
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/throughput.mjs \
  packages/php-wasm .cache/sdl-throughput-first.json
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/throughput.mjs \
  packages/php-wasm .cache/sdl-throughput-second.json
```

Each suite uses a fresh runtime page. JS, Wasm and ICU are routed from the
specified directory and hashed, along with the PHP fixtures and runner. Four
warmup samples precede twelve measured samples per path; case order rotates
each round. No native timing threshold is used as a correctness gate.

| Suite | Work per batch | Correctness check |
| --- | --- | --- |
| Instancing | 1,024 triangles, ordinary or instanced, indexed or non-indexed | Identical full framebuffer for all four paths, with drawn and clear pixels |
| Uniforms | 64 vec4 values through scalar setters, one array setter or a 1 KiB UBO update, then a draw | Every palette entry is rendered; red/green data alternates |
| GL textures | 256 × 256 RGBA bytes through image replacement or subimage update, then a draw | Entire rendered image matches the final uploaded color |
| SDL textures | Same upload through `SDL_UpdateTexture` and `SDL_RenderCopy` | Entire rendered image matches the final uploaded color |
| Events | Bursts of 32 or 1,024 mouse-motion payloads, 32,768 roundtrips per sample | Every event's payload and each burst's exact count |
| Targets | 128 × 128 color/depth targets, two-output MRT, and multisample color/depth followed by resolve | Full framebuffer equality, far-fragment rejection and both MRT outputs |

Input arrays/strings, GL objects and shaders are prepared before measurement. Texture/uniform
samples first render the opposite data; stale uploads cannot satisfy their
final-image checks.
Ordinary draws update an offset uniform for each triangle; instanced draws use
preloaded offsets. Uniform and texture cases consume each update with a draw.
Submission includes PHP loops and native/driver work; full framebuffer readback
measures completion separately. Byte comparisons occur outside those timers.
Event validation is deliberately included in its queue timing. Results report
normalized milliseconds per batch, item/call rates, uploaded MiB/s, raw samples,
browser/renderer details, machine/load and memory snapshots.

The recorded frame interval uses `performance.now()` inside animation callbacks
before and after a whole repeated sample, including request dispatch and event-loop
scheduling. Animation-frame timestamps themselves can be stale after synchronous
work. This interval is not an individual game frame. Zero submission samples
are below the SDL timer resolution; their call rate is reported as unavailable.
These SwiftShader numbers are software-renderer
measurements; they neither predict hardware GPU performance nor set a game FPS
limit. Allocation samples include warmed native live bytes, reserved memory,
Wasm capacity and the V8 heap after GC. Explicit cleanup and PHP refresh are
sampled separately. Stable values only describe these fixtures, not general
leak freedom. Concurrent audio and malformed-asset stress are separate checks.

Append suite names to run a subset, for example `targets`. Render-target
fixtures preallocate their attachments and choose a common supported sample
count for color/depth. Each batch clears, draws a near triangle, attempts an
occluded far triangle, and resolves when needed. A verified opposite-color
frame precedes timing, so stale output cannot satisfy the final pixel check.
Each sample repeats 1,024 batches to keep submission above the SDL clock
resolution; frame intervals describe that entire sample, not a game frame.

For the indexed-draw query investigation, run `index-queries.mjs` twice with
the same artifact-directory/output arguments. It reuses the checked instancing
fixture with four batches per sample. Six rotating rounds compare original
browser methods with wrappers that count and time the real bound-buffer and
buffer-size queries and draw calls. Query results and PHP validation remain
unchanged. Counts must match the number of indexed draws; every sample still
passes full-frame pixel verification. Observed call time includes any waiting
for previously queued rendering, and the observer adds overhead. Keep both
uninstrumented and observed samples when interpreting the result.

## Concurrent mixing

After builds, compression and other tests finish, run twice:

```sh
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/audio.mjs \
  packages/php-wasm .cache/sdl-audio-first.json
PHP_VERSION=8.4 LIB_TYPE=static node test/perf/sdl/audio.mjs \
  packages/php-wasm .cache/sdl-audio-second.json
```

The fixture compares silence, 1/8/32 looping WAV channels, MP3 music, and
32 channels with MP3. WAV generation, decoding and playback setup are outside
measurement. The quiet 440 Hz tone lets actual PCM amplitude verify the
number of contributing channels. Native playing counts are checked before
and after each sample. MP3 playback uses the supplied **Unreal Superhero 3**
by **Kenët and rez**; the report hashes the asset and all measured sources.

Each case warms up, then four rotating rounds record 96 real Web Audio
callbacks after discarding 24 settling callbacks. Timing wraps SDL's actual
callback, including mixing, decoding and output conversion/copy. PCM checks
run after that timer; instrumentation can still affect callback scheduling.
The report retains callback durations, intervals, buffer durations, PCM
levels, device settings and native/V8 memory. Allocation snapshots use the
same warmed playback state each round; cleanup checks native allocations
and processor disconnection. Samples exceeding the buffer duration and long
callback intervals are reported without turning them into claims of audible
underruns. Headless software audio does not measure hardware output latency.
