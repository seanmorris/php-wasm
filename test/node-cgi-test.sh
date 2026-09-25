#!/usr/bin/env bash

set -euo pipefail
PORT=9001
export CI="${CI:-}"
STARTUP_TIMEOUT_SECONDS="${CGI_NODE_TEST_STARTUP_TIMEOUT_SECONDS:-45}"
TEST_RUNTIME="${CGI_TEST_RUNTIME:-node}"
case "${TEST_RUNTIME}" in
	node)
		RUNTIME_IMAGE="${CGI_NODE_TEST_IMAGE:-node:24}"
		test_command=(node --test)
		;;
	bun)
		RUNTIME_IMAGE="${CGI_BUN_TEST_IMAGE:-oven/bun:1.4.0}"
		read -r -a bun_test_flags <<< "${BUN_TEST_FLAGS:---timeout 300000}"
		test_command=(bun test "${bun_test_flags[@]}")
		;;
	*)
		echo "Unsupported CGI test runtime: ${TEST_RUNTIME}" >&2
		exit 1
		;;
esac
CONTAINER="php-cgi-wasm-test-${TEST_RUNTIME}"
TEST_FORMAT="${TEST_FORMAT:-mjs}"
SERVER_FILE="test/cgi-node/server.${TEST_FORMAT}"
TEST_FILE="./test/cgi-node/cgi-node.test.${TEST_FORMAT}"

docker kill "${CONTAINER}" >/dev/null 2>&1 || true

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

docker pull "${RUNTIME_IMAGE}" >/dev/null

docker run --rm --name "${CONTAINER}" "${docker_env[@]}" -p ${PORT}:3003 -v "${HOST_DIR}:${MOUNTED_DIR}" -w /app "${RUNTIME_IMAGE}" "${TEST_RUNTIME}" "${SERVER_FILE}" &
docker_run_pid=$!
trap 'docker kill "${CONTAINER}" >/dev/null 2>&1 || true' EXIT

deadline=$((SECONDS + STARTUP_TIMEOUT_SECONDS))
until docker exec "${CONTAINER}" "${TEST_RUNTIME}" -e 'fetch("http://127.0.0.1:3003/php-wasm/cgi-bin/test/version.php", {signal: AbortSignal.timeout(1000)}).then(response => process.exit(response.ok ? 0 : 1), () => process.exit(1))' >/dev/null 2>&1; do
	if ! kill -0 "${docker_run_pid}" >/dev/null 2>&1; then
		echo "${CONTAINER} exited before becoming ready." >&2
		docker logs "${CONTAINER}" >&2 || true
		exit 1
	fi

	if (( SECONDS >= deadline )); then
		echo "Timed out after ${STARTUP_TIMEOUT_SECONDS}s waiting for CGI ${TEST_RUNTIME} server readiness." >&2
		docker logs "${CONTAINER}" >&2 || true
		exit 1
	fi

	sleep 0.1
done

docker exec \
	-e PHP_VERSION="${PHP_VERSION}" \
	-e LIB_TYPE="${LIB_TYPE:-}" \
	-e CGI_NODE_TEST_PORT=3003 \
	"${CONTAINER}" \
	"${test_command[@]}" "${TEST_FILE}"
