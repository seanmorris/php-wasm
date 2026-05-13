#!/usr/bin/env bash

set -euo pipefail

PHP_VERSION="${1:?usage: verify-sdl-main-module.sh <php-version>}"
WRAPPER="packages/php-wasm/php${PHP_VERSION}_sdl-web.mjs"

if [[ ! -f "${WRAPPER}" ]]; then
	echo "missing SDL wrapper artifact: ${WRAPPER}" >&2
	exit 1
fi

WASM_BASENAME="$(
	perl -ne '
		if (/new URL\("([^"]+\.wasm)", import\.meta\.url\)/) {
			print "$1\n";
			exit 0;
		}
		if (/var f="([^"]+\.wasm)"/) {
			print "$1\n";
			exit 0;
		}
	' "${WRAPPER}"
)"

if [[ -z "${WASM_BASENAME}" ]]; then
	echo "could not resolve wasm path from SDL wrapper: ${WRAPPER}" >&2
	exit 1
fi

WASM="$(dirname "${WRAPPER}")/${WASM_BASENAME}"

if [[ ! -f "${WASM}" ]]; then
	echo "missing SDL wasm artifact: ${WASM}" >&2
	exit 1
fi

if ! command -v wasm-objdump >/dev/null 2>&1; then
	echo "wasm-objdump is required to validate ${WASM}" >&2
	exit 1
fi

if wasm-objdump -x "${WASM}" | grep -E -q 'GOT\.mem\.SDL_(HIDAPI|VIRTUAL|DUMMY)_JoystickDriver'; then
	echo "SDL main module still imports joystick driver globals: ${WASM}" >&2
	exit 1
fi

if wasm-objdump -x "${WASM}" | grep -E -q '<env\.emscripten_compute_dom_pk_code> <- env\.emscripten_compute_dom_pk_code'; then
	echo "SDL main module still imports emscripten_compute_dom_pk_code: ${WASM}" >&2
	exit 1
fi

if grep -E -q 'asyncifyStubs\["emscripten_compute_dom_pk_code"\]=undefined' "${WRAPPER}"; then
	echo "SDL wrapper still leaves emscripten_compute_dom_pk_code unresolved: ${WRAPPER}" >&2
	exit 1
fi
