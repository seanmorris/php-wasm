#!/usr/bin/env bash

set -euo pipefail
PORT=9000
export CI="${CI:-}"

pushd demo-web >/dev/null
npm run build
DEMO_WEB_E2E_PORT="${PORT}" node test/e2e-server.mjs &
SERVER_PID=$!
popd >/dev/null

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
DEMO_WEB_E2E_PORT="${PORT}" \
npx playwright test "${PLAYWRIGHT_ARGS[@]}"

pushd demo-web >/dev/null
PHP_VERSION="${PHP_VERSION}" \
DEMO_WEB_E2E_PORT="${PORT}" \
npx playwright test -c playwright.config.mjs
popd >/dev/null
