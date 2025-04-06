#!/usr/bin/env bash

set -eux;
PORT=9000

pushd demo-web && {
	npm run build
	docker run -d --rm --name php-wasm-apache -p ${PORT}:80 -v "${PWD}/build":/usr/local/apache2/htdocs/php-wasm httpd:2.4 &
	trap "docker kill php-wasm-apache" 0;
};

popd;

set +x;
while ! nc -z localhost ${PORT}; do
	sleep 0.1
done
set -x;

npx cvtest test/BrowserTest.mjs
