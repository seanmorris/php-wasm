# waitline

`waitline` is the line-reader extension used by `php-wasm` for interactive CLI and debugger input.

This package exists so the build system can vendor the upstream `waitline` extension into `php-cli-wasm` and related builds.
It does not expose a separate JavaScript API from this folder.

## What It Is For

`waitline` replaces normal blocking STDIN reads with an async, JavaScript-backed line source.
That is what makes browser-hosted `php -a` sessions and `phpdbg` prompts workable in wasm-hosted environments.

## Do You Need To Install It Directly?

Usually no.

If you are using the published CLI/debug runtime packages, `waitline` is expected to already be included.
You normally only care about this package when you are maintaining custom builds, debugging interactive input behavior, or overriding the vendored source checkout.

## Custom Builds

For raw custom builds, enable it in `.php-wasm-rc`:

```sh
WITH_WAITLINE=1
```

Important distinction:

- published CLI/debug artifacts generally enable `waitline`
- the custom builder default for `WITH_WAITLINE` is still `0`

## Build Options

- `WITH_WAITLINE`: defaults to `0` in the custom builder. Set it to `1` to compile the extension in.
- `WAITLINE_REPOSITORY`: optional Git repository override. Defaults to the upstream Waitline repository.
- `WAITLINE_REF`: Git commit or ref to build. The default pins `acd126e69f56f281a9dccb0e4eea24786403f46d`, the readline API and interactive-input implementation used by the integration tests.
- `WAITLINE_BRANCH`: legacy branch override, used only when `WAITLINE_REF` is not explicitly set. It no longer defaults to `master`, which lacks the readline API.
- `WAITLINE_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `waitline` repository during the build.

Imports verify source identity and contents on every build. Changing refs or development checkouts, editing headers (including generated arginfo), or adding/removing inputs refreshes both the staged source and the PHP extension. Unchanged imports preserve timestamps and avoid recompilation. PHP configuration, base, CLI, CGI, and debugger builds all depend on the active extension manifest.

Managed inputs are root-level C, header, and PHP stub files, `config.m4`, `config.w32`, `README.md`, `CREDITS`, and `LICENSE`. Development checkouts are read-only inputs and may live outside the Docker mount; only managed inputs are transferred. The builder owns all destination writes, so cached root-owned outputs require no host-side ownership changes.

Source manifests and a pending-import record repair interrupted updates. Legacy imports without a valid manifest adopt the managed input classes above; Git metadata, compiled objects, and unrelated files are preserved. Do not use an import destination as `WAITLINE_DEV_PATH`.

Run the lightweight real-Make regression suite with:

```sh
node --test test/build/waitline-importer.test.mjs
docker build -f test/build/vrzno-importer.Dockerfile -t php-wasm-vrzno-importer test/build
WAITLINE_IMPORTER_DOCKER=1 node --test test/build/waitline-importer.test.mjs
```

The Docker variant requires a non-root host user and Docker access. CI requires both variants; root-only local checks do not replace the ownership test.
