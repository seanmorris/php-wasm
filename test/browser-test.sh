#!/usr/bin/env bash

set -euo pipefail
PORT=9000
export CI="${CI:-}"
BROWSER_TEST_PORT="${PORT}" node test/browser/server.mjs &
SERVER_PID=$!

trap 'kill ${SERVER_PID}' EXIT

until curl -fsS "http://127.0.0.1:${PORT}/php-wasm/" >/dev/null; do
	sleep 0.1
done

PLAYWRIGHT_ARGS=(-c playwright.config.mjs test/browser/browser.spec.mjs)

if [[ -n "${UPDATE_SNAPSHOTS:-}" || -n "${CV_UPDATE_SNAPSHOTS:-}" ]]; then
	PLAYWRIGHT_ARGS+=(--update-snapshots)
fi

PHP_VERSION="${PHP_VERSION}" \
PHP_VARIANT="${PHP_VARIANT:-}" \
BROWSER_TEST_PORT="${PORT}" \
BUILD_TYPE="${BUILD_TYPE:-dynamic}" \
npx playwright test "${PLAYWRIGHT_ARGS[@]}"
