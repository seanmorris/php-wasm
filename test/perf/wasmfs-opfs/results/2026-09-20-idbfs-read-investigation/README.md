# IDBFS read-side investigation — 2026-09-20

Keep the existing remote timestamp cursor. A schema-compatible bulk enumeration
prototype was **20–29% slower on the five larger framework trees**. CodeIgniter's
small tree changed by less than half a millisecond. This experiment remains in
the diagnostic harness and is not enabled in production.

See the [measurements](results.md), [CSV](results.csv), [summary](summary.json),
and [seven complete raw trials](trials/). The preceding
[production change](../2026-09-20-incremental-idbfs/README.md) still removes full
scans from warm commits; this investigation concerns hydration from IndexedDB.

## What was tested

The existing implementation walks the `timestamp` index with `openKeyCursor()`.
The prototype combines `index.getAllKeys()` with a `nextunique` key cursor in
one read transaction. Primary keys arrive in timestamp order; the first primary
key in each timestamp group marks the boundary for assigning that timestamp to
the bulk keys. The [IndexedDB cursor ordering contract](https://www.w3.org/TR/IndexedDB-3/#cursor-direction-nextunique)
defines this grouping. Neither request loads file contents or changes the schema.

Before enabling the prototype, each trial compares every path and timestamp
with ordinary IDBFS for both mounts. Drupal's 17,844 records contained 1,245
distinct timestamps in the repeat: fewer events did not make the scan faster.

The timing breakdown explains the result. In that Drupal repeat, the bulk-key
request alone took a median 199.9 ms. The unique cursor finished at 373.4 ms
from transaction creation, and assigning timestamps in JavaScript took 5.9 ms.
The prototype performs two index traversals; reducing JavaScript cursor events
did not compensate for that extra work. These intervals overlap and should not
be added together. Total hydration rose from 337.4 to 405.0 ms. The independent
first Drupal trial also regressed, from approximately 322 to 400 ms.

This result rules out this particular bulk-key approach for the measured
workloads. It does not establish an IndexedDB performance limit or rule out
future metadata storage changes. Production retains compatibility with ordinary
IDBFS databases and writers.

## Method and reproduction

Each fresh persistent Chrome profile restores its existing archive, performs
six warm requests, then measures six ordinary and six grouped hydrations of
the same synchronized data. The six-framework repeat includes detailed API
timing. Ordinary scans always run first, so these are diagnostic comparisons,
not randomized confidence intervals. No builds, test suites or compression ran
alongside the measurements.

All seven trials validate the framework response, compare three selected
immutable files with their archive bytes, restart the worker, and compare those
bytes again. The prototype is enabled only for the grouped measurement phase;
restart uses the production helper with the ordinary remote scan. Sources for
the first prototype and the instrumented repeat are retained separately under
`sources/prototype-0` and `sources/prototype-1`; the repeat's hashes are listed in
[source-inputs.json](source-inputs.json). Native JS/Wasm inputs are unchanged.

With the [benchmark server](../../README.md#reproduce) running:

```sh
BENCH_FIRST_ROUND=2 node test/perf/wasmfs-opfs/diagnose.mjs idbfs drupal grouped-idbfs
```

Replace `drupal` with another framework identifier to repeat that case. The
runner refuses to overwrite an existing result and removes its owned browser
profile on completion. The first trial reused the RPC measurement label before
the extra timing instrumentation was added; use its separately named hydration
samples for comparisons. Round 1 gives the grouped RPC measurement its own label.
