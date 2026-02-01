#!/usr/bin/env bash

set -eux;
PORT=9001
export CI=

set +e;
docker kill php-cgi-wasm-test-node;
set -e;

HOST_DIR="${PWD}"
MOUNTED_DIR="/app"

docker run --rm --name php-cgi-wasm-test-node -e PHP_VERSION=${PHP_VERSION} -e BUILD_TYPE=${BUILD_TYPE} -p ${PORT}:3003 -v ${HOST_DIR}:${MOUNTED_DIR} -w /app node:24 npm start --prefix demo-node/ &
trap "docker kill php-cgi-wasm-test-node" 0;

set +x;
while ! nc -z localhost ${PORT}; do
	sleep 0.1
done
set -x;

sleep 5;

PHP_VERSION=${PHP_VERSION} npx cvtest test/NodeCgiTest.mjs;
