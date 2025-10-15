#!/usr/bin/env bash

PACKAGE_DIR=${1}
cd ${PACKAGE_DIR}/
set -euo pipefail
ls *.wasm | while read FILENAME; do
	brotli -fq 11 ${FILENAME}
	gzip -fkv9 ${FILENAME}
done;
