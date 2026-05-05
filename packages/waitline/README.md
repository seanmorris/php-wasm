# waitline

`waitline` is an internal helper extension used by `php-wasm` builds that need asynchronous, line-oriented STDIN behavior.

This package does not ship a JavaScript entrypoint or a separately loadable shared-library module for end users.
It exists so the build system can vendor the upstream `waitline` extension into custom PHP CLI and related builds.

## When You Need It

If you are consuming the published `php-wasm` runtime packages, you usually do not need to install or reference `waitline` directly.
It matters when you are maintaining custom builds, debugging interactive input behavior, or working on the underlying runtime plumbing.

## Custom Builds

Enable `WITH_WAITLINE=1` in `.php-wasm-rc`.

## Build Options

- `WITH_WAITLINE`: defaults to `0`. Set it to `1` to compile the extension into a custom build.
- `WAITLINE_BRANCH`: optional upstream branch override. Defaults to `master`.
- `WAITLINE_DEV_PATH`: optional local source checkout to use instead of cloning the upstream `waitline` repository during the build.
