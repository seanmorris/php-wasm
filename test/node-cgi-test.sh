#!/usr/bin/env bash

set -euo pipefail
PORT=9001
export CI="${CI:-}"

docker kill php-cgi-wasm-test-node >/dev/null 2>&1 || true

HOST_DIR="${PWD}"
MOUNTED_DIR="/app"

docker run --rm --name php-cgi-wasm-test-node -e PHP_VERSION=${PHP_VERSION} -e BUILD_TYPE=${BUILD_TYPE} -p ${PORT}:3003 -v ${HOST_DIR}:${MOUNTED_DIR} -w /app node:24 npm start --prefix demo-node/ &
trap "docker kill php-cgi-wasm-test-node" 0;

until docker exec php-cgi-wasm-test-node sh -lc 'wget -qO- http://127.0.0.1:3003/php-wasm/cgi-bin/test/version.php >/dev/null' >/dev/null 2>&1; do
	sleep 0.1
done

docker exec \
	-e PHP_VERSION="${PHP_VERSION}" \
	-e CGI_NODE_TEST_PORT=3003 \
	php-cgi-wasm-test-node \
	node --test test/cgi-node/cgi-node.test.mjs
