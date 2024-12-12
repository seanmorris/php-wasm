#!/usr/bin/env bash

set -x;

# SOURCE_MAP=packages/php-wasm/php-node.mjs.wasm.map
# SOURCE_MAP=packages/php-cgi-wasm/php-cgi-worker.mjs.wasm.map
# SOURCE_MAP=packages/php-wasm/php-web.mjs.wasm.map

SOURCE_MAP=${1}

SOURCE_MAP_DIR=`dirname ${SOURCE_MAP}`

MAPPED=${SOURCE_MAP_DIR}/mapped;
BACKUP=${SOURCE_MAP}.BAK
PHP_VERSION=8.4

if [ -e ${BACKUP} ]; then {
	rm ${BACKUP};
} fi;

cp ${SOURCE_MAP} ${BACKUP}

mkdir -p ${MAPPED}

jq -r '.sources[] | select( match("^\\.\\./\\.\\./(?!\\.\\.)")) | sub("../../"; "")' < ${SOURCE_MAP} \
| while read SOURCE_FILE; do {
	DIRNAME=`dirname ${SOURCE_FILE}`;
	BASENAME=`basename ${SOURCE_FILE}`;
	DEST_DIR=${MAPPED}/php${PHP_VERSION}/${DIRNAME}/;
	mkdir -p ${DEST_DIR};
	cp third_party/php${PHP_VERSION}-src/${SOURCE_FILE} ${DEST_DIR}${BASENAME};
}; done;

jq -r '.sources[] | select( match("^\\.\\./\\.\\./\\.\\./\\.\\./\\.\\./")) | sub("../../../../../"; "/")' < ${SOURCE_MAP} \
| while read SOURCE_FILE; do {
	DIRNAME=`dirname ${SOURCE_FILE}`;
	BASENAME=`basename ${SOURCE_FILE}`;
	DEST_DIR=${MAPPED}/${DIRNAME}/;
	mkdir -p ${DEST_DIR};
	cp ${SOURCE_FILE} ${DEST_DIR}${BASENAME};
}; done;

jq -r '.sources[] | select( match("^(?:.+)")) | sub("../../"; "")' < ${SOURCE_MAP} \
| while read SOURCE_FILE; do {
	if [[ ${SOURCE_FILE} == ../../* ]]; then
		continue;
	fi;
	DIRNAME=`dirname ${SOURCE_FILE}`;
	BASENAME=`basename ${SOURCE_FILE}`;
	DEST_DIR=${MAPPED}/php${PHP_VERSION}/${DIRNAME}/;
	mkdir -p ${DEST_DIR};
	cp third_party/php${PHP_VERSION}-src/${SOURCE_FILE} ${DEST_DIR}${BASENAME};
}; done;

sed -i 's|\.\./\.\./\.\./\.\./\.\./|mapped/|g' ${SOURCE_MAP}
sed -i 's|\.\./\.\./|mapped/php'"${PHP_VERSION}"'/|g' ${SOURCE_MAP}

chown -R ${OUTER_UID} ${MAPPED}
