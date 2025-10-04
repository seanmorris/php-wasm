#!/usr/bin/env bash

PACKAGE_DIR=${1}
cd ${PACKAGE_DIR}/

ORIGINAL_COUNT=`ls php-*.wasm 2> /dev/null | wc -l`
HASHED_COUNT=`ls [0123456789abcdef]*.wasm 2> /dev/null | wc -l`

if [[ ${ORIGINAL_COUNT} == "0" ]]; then
	echo "${ORIGINAL_COUNT} original, ${HASHED_COUNT} hashed files found, is this package (${PACKAGE_DIR}) already compressed?"
fi

# THIS SCRIPT SHOULD QUIT IMMEDIATELY UPON ERRORS
set -euo pipefail

# rm -f [0123456789abcdef]*.wasm

ls php*.wasm | while read FILENAME; do
	SHA_HASH=`sha1sum $FILENAME | cut -f1 -d' '`
	HASHNAME=${SHA_HASH}.wasm

	echo ${FILENAME}
	echo ${SHA_HASH}

	if [ -e "${HASHNAME}" ]; then
		echo EXISTS ${FILENAME} ${HASHNAME}
		echo ${SHA_HASH} ${FILENAME} | sha1sum -c -
		echo ${SHA_HASH} ${HASHNAME} | sha1sum -c -
	fi

	echo MOVING ${FILENAME} ${HASHNAME}
	mv ${FILENAME} ${HASHNAME}

	JS_FILE=${FILENAME::-5}

	cp ${JS_FILE} ${JS_FILE}.tmp

	perl -pi -w -e 's|'${FILENAME}'|'${HASHNAME}'|g' ${JS_FILE}.tmp

	mv ${JS_FILE}.tmp ${JS_FILE}

done;
