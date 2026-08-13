#!/usr/bin/env bash

set -euo pipefail

MAX_ATTEMPTS="${DOWNLOAD_RETRY_ATTEMPTS:-5}"
DELAY_SECONDS="${DOWNLOAD_RETRY_DELAY_SECONDS:-5}"

if [[ ! "${MAX_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]]; then
	echo "DOWNLOAD_RETRY_ATTEMPTS must be a positive integer: ${MAX_ATTEMPTS}" >&2
	exit 2
fi

if [[ ! "${DELAY_SECONDS}" =~ ^[0-9]+$ ]]; then
	echo "DOWNLOAD_RETRY_DELAY_SECONDS must be a non-negative integer: ${DELAY_SECONDS}" >&2
	exit 2
fi

if (( $# != 2 )); then
	echo "usage: retry-download.sh <url> <output-file>" >&2
	exit 2
fi

URL="$1"
OUTPUT_FILE="$2"
PART_FILE="${OUTPUT_FILE}.part.$$"
trap 'rm -f "${PART_FILE}"' EXIT

attempt=1
delay="${DELAY_SECONDS}"

while true; do
	echo "download attempt ${attempt}/${MAX_ATTEMPTS}: ${URL}" >&2
	rm -f "${PART_FILE}"

	set +e
	curl \
		--connect-timeout 20 \
		--fail \
		--location \
		--max-time 120 \
		--output "${PART_FILE}" \
		--show-error \
		--silent \
		"${URL}"
	curl_status=$?
	set -e

	if (( curl_status == 0 )); then
		mv "${PART_FILE}" "${OUTPUT_FILE}"
		exit 0
	fi

	if (( attempt >= MAX_ATTEMPTS )); then
		echo "download failed after ${attempt} attempts (curl exit ${curl_status})" >&2
		exit "${curl_status}"
	fi

	echo "download failed (curl exit ${curl_status}); retrying in ${delay} seconds" >&2
	sleep "${delay}"
	attempt=$((attempt + 1))
	delay=$((delay * 2))
done
