# waitline

`waitline` is the line-reader extension used by `php-wasm` for interactive CLI and debugger input.

This package vendors the upstream extension and exposes a dynamic-loader entrypoint
for `php-cli-wasm` and related builds. Its embedded JavaScript is carried by the
side module; no companion JavaScript asset is required.

## What It Is For

`waitline` replaces normal blocking STDIN reads with an async, JavaScript-backed line source.
That is what makes browser-hosted `php -a` sessions and `phpdbg` prompts workable in wasm-hosted environments.

## Do You Need To Install It Directly?

Usually no.

Published CLI/debug runtimes include Waitline statically in every standard profile.
The package also ships the side module, `php8.x-waitline.so`, for PHP 8.0 to 8.5, for
custom runtimes built without Waitline linked in. A standard runtime has no use for it.
You normally only care about this package when you are maintaining custom builds, debugging interactive input behavior, or overriding the vendored source checkout.

For a custom build with `WITH_WAITLINE=dynamic`, pass the loader to the runtime:

```js
import { PhpCliWeb } from 'php-cli-wasm/PhpCliWeb.mjs';
import waitline from 'waitline';

const php = new PhpCliWeb({version: '8.4', sharedLibs: [waitline]});
```

## Custom Builds

For raw custom builds, enable it in `.php-wasm-rc`:

```sh
WITH_WAITLINE=1
```

Important distinction:

- published CLI/debug artifacts generally enable `waitline`
- the custom builder default for `WITH_WAITLINE` is still `0`

## Build Options

- `WITH_WAITLINE`: accepts `0`, `1`, `static`, or `dynamic` and defaults to `0`. `1` remains an alias for `static`.
- `WAITLINE_REPOSITORY`: optional Git repository override. Defaults to the upstream Waitline repository.
- `WAITLINE_REF`: Git commit or ref to build. The default pins `94d7d7670de85b5b5018ed9f35206d56146efc0a`, which includes the readline API and interactive-input implementation used by the integration tests.
- `WAITLINE_BRANCH`: legacy branch override, used only when `WAITLINE_REF` is not explicitly set. Leave it unset to use the pinned commit.
- `WAITLINE_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `waitline` repository during the build.

Imports verify source identity and contents on every build. Changing refs or development checkouts, editing headers (including generated arginfo), or adding/removing inputs refreshes both the staged source and the PHP extension. Unchanged imports preserve timestamps and avoid recompilation. PHP configuration, base, CLI, CGI, and debugger builds all depend on the active extension manifest.

Managed inputs are root-level C, header, and PHP stub files, `js/waitline_*.js`, `waitline_js.h.in`, `Makefile.frag`, `config.m4`, `config.w32`, `README.md`, `CREDITS`, `LICENSE`, `LICENSE-GPL`, and `NOTICE`. Make embeds the JS into the native object through Emscripten’s directives-only preprocessor; generated headers and dependencies stay in the build directory. Development checkouts are read-only inputs and may live outside the Docker mount; only managed inputs are transferred. The builder owns all destination writes, so cached root-owned outputs require no host-side ownership changes.

Source manifests and a pending-import record repair interrupted updates. Legacy imports without a valid manifest adopt the managed input classes above; Git metadata, compiled objects, and unrelated files are preserved. Do not use an import destination as `WAITLINE_DEV_PATH`.

Run the lightweight real-Make regression suite with:

```sh
node --test test/build/waitline-importer.test.mjs
docker build -f test/build/vrzno-importer.Dockerfile -t php-wasm-vrzno-importer test/build
WAITLINE_IMPORTER_DOCKER=1 node --test test/build/waitline-importer.test.mjs
```

The Docker variant requires a non-root host user and Docker access. CI requires both variants; root-only local checks do not replace the ownership test.
