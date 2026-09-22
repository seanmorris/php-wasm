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
