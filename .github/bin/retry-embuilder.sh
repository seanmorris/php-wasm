#!/usr/bin/env bash

set -euo pipefail

MAX_ATTEMPTS="${EMBUILDER_RETRY_ATTEMPTS:-5}"
DELAY_SECONDS="${EMBUILDER_RETRY_DELAY_SECONDS:-5}"

if [[ ! "${MAX_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]]; then
	echo "EMBUILDER_RETRY_ATTEMPTS must be a positive integer: ${MAX_ATTEMPTS}" >&2
	exit 2
fi

if [[ ! "${DELAY_SECONDS}" =~ ^[0-9]+$ ]]; then
	echo "EMBUILDER_RETRY_DELAY_SECONDS must be a non-negative integer: ${DELAY_SECONDS}" >&2
	exit 2
fi

if (( $# == 0 )); then
	echo "usage: retry-embuilder.sh <embuilder-argument> [...]" >&2
	exit 2
fi

TRANSIENT_ERROR_PATTERN='RemoteDisconnected|Remote end closed connection|HTTP Error (408|425|429|5[0-9][0-9])|Connection(Reset|Aborted|Refused)Error|TimeoutError|timed out|Temporary failure in name resolution|Name or service not known|IncompleteRead|urlopen error|UNEXPECTED_EOF_WHILE_READING'
LOG_FILE="$(mktemp)"
trap 'rm -f "${LOG_FILE}"' EXIT

attempt=1
delay="${DELAY_SECONDS}"

while true; do
	echo "embuilder attempt ${attempt}/${MAX_ATTEMPTS}: embuilder $*" >&2
	: > "${LOG_FILE}"

	set +e
	embuilder "$@" 2>&1 | tee "${LOG_FILE}"
	statuses=("${PIPESTATUS[@]}")
	set -e

	embuilder_status="${statuses[0]}"
	tee_status="${statuses[1]}"

	if (( tee_status != 0 )); then
		echo "could not capture embuilder output (tee exited ${tee_status})" >&2
		exit "${tee_status}"
	fi

	if (( embuilder_status == 0 )); then
		exit 0
	fi

	if ! grep -Eiq "${TRANSIENT_ERROR_PATTERN}" "${LOG_FILE}"; then
		echo "embuilder failed with a non-retryable error (exit ${embuilder_status})" >&2
		exit "${embuilder_status}"
	fi

	if (( attempt >= MAX_ATTEMPTS )); then
		echo "embuilder failed after ${attempt} attempts (exit ${embuilder_status})" >&2
		exit "${embuilder_status}"
	fi

	echo "transient embuilder download failure; retrying in ${delay} seconds" >&2
	sleep "${delay}"
	attempt=$((attempt + 1))
	delay=$((delay * 2))
done
