#!/usr/bin/env bash

set -euo pipefail
PORT=9001
export CI="${CI:-}"
STARTUP_TIMEOUT_SECONDS="${CGI_NODE_TEST_STARTUP_TIMEOUT_SECONDS:-45}"
NODE_IMAGE="${CGI_NODE_TEST_IMAGE:-node:24}"
TEST_FORMAT="${TEST_FORMAT:-mjs}"
SERVER_FILE="test/cgi-node/server.${TEST_FORMAT}"
TEST_FILE="test/cgi-node/cgi-node.test.${TEST_FORMAT}"

docker kill php-cgi-wasm-test-node >/dev/null 2>&1 || true

HOST_DIR="${PWD}"
MOUNTED_DIR="/app"
docker_env=(
	-e "PHP_VERSION=${PHP_VERSION}"
	-e "LIB_TYPE=${LIB_TYPE:-}"
	-e "CGI_NODE_TEST_PORT=3003"
)

while IFS='=' read -r env_name _; do
	docker_env+=(-e "${env_name}=${!env_name}")
done < <(env | grep '^WITH_' | sort)

docker pull "${NODE_IMAGE}" >/dev/null

docker run --rm --name php-cgi-wasm-test-node "${docker_env[@]}" -p ${PORT}:3003 -v ${HOST_DIR}:${MOUNTED_DIR} -w /app "${NODE_IMAGE}" node "${SERVER_FILE}" &
docker_run_pid=$!
trap "docker kill php-cgi-wasm-test-node" 0;

deadline=$((SECONDS + STARTUP_TIMEOUT_SECONDS))
until docker exec php-cgi-wasm-test-node sh -lc 'wget -qO- http://127.0.0.1:3003/php-wasm/cgi-bin/test/version.php >/dev/null' >/dev/null 2>&1; do
	if ! kill -0 "${docker_run_pid}" >/dev/null 2>&1; then
		echo "php-cgi-wasm-test-node exited before becoming ready." >&2
		docker logs php-cgi-wasm-test-node >&2 || true
		exit 1
	fi

	if (( SECONDS >= deadline )); then
		echo "Timed out after ${STARTUP_TIMEOUT_SECONDS}s waiting for CGI Node server readiness." >&2
		docker logs php-cgi-wasm-test-node >&2 || true
		exit 1
	fi

	sleep 0.1
done

docker exec \
	-e PHP_VERSION="${PHP_VERSION}" \
	-e LIB_TYPE="${LIB_TYPE:-}" \
	-e CGI_NODE_TEST_PORT=3003 \
	php-cgi-wasm-test-node \
	node --test "${TEST_FILE}"
