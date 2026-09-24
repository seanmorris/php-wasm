# Extension source importers

PGlite, CFD1, Vrzno, and Waitline share the source importer in
[`source-importer.mjs`](source-importer.mjs). Each package's `import-source.mjs`
calls `runSourceImporter(policy)` with its package names, allowed input files,
required files, and compatibility settings. CFD1 enables legacy patch identity
handling. Repository URLs, default commits, and ref/development overrides remain
in each package's Makefiles.

Edit the shared implementation or the small package callers directly, then run:

```sh
npm run test:importers
```

There is no generation step. The `php-wasm-builder` package ships the shared
implementation once in `bin`; extension packages ship only their callers and
policies. Make runs from the builder workspace, so each caller loads
`bin/source-importer.mjs` relative to the current directory. This also works with
hoisted npm dependencies and prepared build workspaces, which include `bin`.
The import commands require that builder workspace; an extension tarball alone
does not carry the shared implementation. No new npm dependency is needed.

`npm run test:importers` runs the shared real Git/Make contract in
[`test/build/source-importer-contract.mjs`](../test/build/source-importer-contract.mjs).
Its fixture defines expected inputs independently from the production policies.
The package test files retain package-specific cases, including CFD1's migration
from patched manifests and Waitline's legacy branch override. The separate
[`cloudflare-build.test.mjs`](../test/build/cloudflare-build.test.mjs) suite executes
the packed CFD1 and Vrzno commands from both an installed builder and an isolated
build snapshot. Packaging tests use `--ignore-scripts`.

The importer protocol remains:

```text
node packages/<package>/import-source.mjs snapshot DEV_PATH PHP_VERSION
node packages/<package>/import-source.mjs stage REPOSITORY REF
node packages/<package>/import-source.mjs stage --stdin
node packages/<package>/import-source.mjs sync PHP_VERSION
```

Commands operate relative to the build workspace's current directory. Development
snapshots are read by the host and streamed to the builder. The builder owns the
staged sources, Git cache, and PHP extension destination. Manifest formats, cache
locations, source bytes, and no-op timestamps are preserved by this consolidation.

CI runs the host contract checks before native builds. Its Docker lane exercises
the same contract with a nonroot host and a root builder, including artifact
restore and npm package layouts. To run that lane locally as a nonroot user with
Docker access:

```sh
docker build -f test/build/vrzno-importer.Dockerfile -t php-wasm-vrzno-importer test/build
VRZNO_IMPORTER_DOCKER=1 PDO_PGLITE_IMPORTER_DOCKER=1 \
PDO_CFD1_IMPORTER_DOCKER=1 WAITLINE_IMPORTER_DOCKER=1 npm run test:importers
```

The fixture uses the existing `php-wasm-vrzno-importer` image for all four packages.
Each package can override it with its corresponding `*_IMPORTER_IMAGE` variable.
