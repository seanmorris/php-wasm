#!/usr/bin/env bash

set -eux;
PORT=9000
export CI=

pushd demo-web && npm run build && popd;

HOST_DIR="${PWD}/demo-web/build"
MOUNTED_DIR="/usr/local/apache2/htdocs/php-wasm httpd:2.4"

docker kill php-wasm-apache || true;
docker run -d --rm --name php-wasm-apache -p ${PORT}:80 -v "${HOST_DIR}":"${MOUNTED_DIR}" &
trap "docker kill php-wasm-apache" 0 &
npx cvtest test/BrowserTest.mjs &
wait;
