#!/usr/bin/env bash

set -eux;
PORT=9000
export CI=

# pushd demo-web && npm run build && popd;

docker kill php-wasm-test-apache || true;

HOST_DIR="${PWD}/demo-web/build"
MOUNTED_DIR="/usr/local/apache2/htdocs/php-wasm httpd:2.4"

docker run -d --rm --name php-wasm-test-apache -p ${PORT}:80 -v ${HOST_DIR}:${MOUNTED_DIR} &
trap "docker kill php-wasm-test-apache" 0;

npx cvtest test/BrowserTest.mjs;
