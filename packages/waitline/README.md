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
- `WAITLINE_BRANCH`: optional upstream branch override. Defaults to `master`.
- `WAITLINE_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `waitline` repository during the build.
