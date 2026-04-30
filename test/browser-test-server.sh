#!/usr/bin/env bash

set -eux;
PORT=9000
export CI=

docker kill php-wasm-test-apache || true;

HOST_DIR="${PWD}/demo-web/build"
MOUNTED_DIR="/usr/local/apache2/htdocs/php-wasm httpd:2.4"

docker run -it --rm --name php-wasm-test-apache -p ${PORT}:80 -v ${HOST_DIR}:${MOUNTED_DIR}
