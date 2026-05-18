#!/usr/bin/env bash

set -euo pipefail

PORT="${BROWSER_TEST_PORT:-9414}"
ARTIFACT_ROOT="${DEMO_WEB_ARTIFACT_ROOT:-docs}"

export CI="${CI:-}"

BROWSER_TEST_PORT="${PORT}" \
DEMO_WEB_ARTIFACT_ROOT="${ARTIFACT_ROOT}" \
node test/browser/demo-web-artifact-server.mjs &
SERVER_PID=$!

trap 'kill ${SERVER_PID}' EXIT

until curl -fsS "http://127.0.0.1:${PORT}/php-wasm/home.html" >/dev/null; do
	sleep 0.1
done

PLAYWRIGHT_ARGS=(-c playwright.config.mjs test/browser/demo-web-artifact.spec.mjs)

PHP_VERSION="${PHP_VERSION:-8.4}" \
BROWSER_TEST_PORT="${PORT}" \
LIB_TYPE="${LIB_TYPE:-${BUILD_TYPE:-dynamic}}" \
DEMO_WEB_ARTIFACT_ROOT="${ARTIFACT_ROOT}" \
npx playwright test "${PLAYWRIGHT_ARGS[@]}"
