#!/usr/bin/env bash

set -eux;
PORT=9000
export CI=

pushd demo-web;
npm run build;
popd;

set +e;
docker kill php-wasm-test-apache;
set -e;

HOST_DIR="${PWD}/demo-web/build"
MOUNTED_DIR="/usr/local/apache2/htdocs/php-wasm"

docker run -d --rm --name php-wasm-test-apache -p ${PORT}:80 -v ${HOST_DIR}:${MOUNTED_DIR} httpd:2.4 &
trap "docker kill php-wasm-test-apache" 0;

set +x;
while ! nc -z localhost ${PORT}; do
	sleep 0.1
done
set -x;

PHP_VERSION=${PHP_VERSION} npx cvtest test/BrowserTest.mjs;
