#!/usr/bin/env bash

set -eux;
PORT=9000
export CI=

pushd demo-web && npm run build && popd;

# docker run -d --rm --name php-wasm-apache -p ${PORT}:80 -v "${PWD}/demo-web/build":/usr/local/apache2/htdocs/php-wasm httpd:2.4 \
# & trap "docker kill php-wasm-apache" 0 \
npx cvtest test/BrowserTest.mjs
