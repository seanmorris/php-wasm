#!/usr/bin/env bash
set -euo pipefail

# Keep this historical runtime fixed: it supplies the global `buffer` from #91.
CACHE=.cache/browser-webperl
ARCHIVE="${CACHE}/webperl_prebuilt_v0.09-beta.zip"
mkdir -p "${CACHE}"
if [[ ! -f "${ARCHIVE}" ]]; then
	bash .github/bin/retry-download.sh \
		https://github.com/haukex/webperl/releases/download/v0.09-beta/webperl_prebuilt_v0.09-beta.zip \
		"${ARCHIVE}"
fi
printf '%s  %s\n' \
	5f441249217e90ab378c666f473d4206ab4f44907f6bb0aa8d70834bc38c40dc \
	"${ARCHIVE}" | sha256sum --check --status
unzip -oq "${ARCHIVE}" -d "${CACHE}"
