#!/usr/bin/env bash

set -euo pipefail
bash test/browser/prepare-webperl.sh
PORT=9000
export CI="${CI:-}"
BROWSER_TEST_PORT="${PORT}" node test/browser/server.mjs &
SERVER_PID=$!

trap 'kill ${SERVER_PID}' EXIT

until curl -fsS "http://127.0.0.1:${PORT}/php-wasm/" >/dev/null; do
	sleep 0.1
done

PLAYWRIGHT_ARGS=(
	-c playwright.config.mjs
	test/browser/browser.spec.mjs
	test/browser/runtime-regressions.spec.mjs
	test/browser/idbfs.spec.mjs
	test/browser/sdl.spec.mjs
	test/browser/sdl-bindings.spec.mjs
	test/browser/sdl-engine.spec.mjs
	test/browser/sdl-geometry.spec.mjs
	test/browser/sdl-coordinates.spec.mjs
	test/browser/sdl-textures.spec.mjs
	test/browser/sdl-lifetimes.spec.mjs
	test/browser/sdl-buffers.spec.mjs
	test/browser/sdl-streams.spec.mjs
	test/browser/sdl-cursors.spec.mjs
	test/browser/sdl-input.spec.mjs
	test/browser/sdl-text.spec.mjs
	test/browser/sdl-pointer.spec.mjs
	test/browser/sdl-audio.spec.mjs
	test/browser/sdl-windows.spec.mjs
	test/browser/sdl-serialization.spec.mjs
	test/browser/sdl-stress.spec.mjs
)

if [[ -n "${UPDATE_SNAPSHOTS:-}" || -n "${CV_UPDATE_SNAPSHOTS:-}" ]]; then
	PLAYWRIGHT_ARGS+=(--update-snapshots)
fi

PHP_VERSION="${PHP_VERSION}" \
PHP_VARIANT="${PHP_VARIANT:-}" \
BROWSER_TEST_PORT="${PORT}" \
LIB_TYPE="${LIB_TYPE:-${BUILD_TYPE:-dynamic}}" \
npx playwright test "${PLAYWRIGHT_ARGS[@]}"
