#!/usr/bin/env bash

set -eu;

PHP_VERSION=8.3

SOURCE_MAP=${1}
DEST_DIR=${2}

DEST_DIR_REALPATH=`realpath ${DEST_DIR}`

SOURCE_MAP_BASENAME=`basename ${SOURCE_MAP}`
SOURCE_MAP_REALPATH=`realpath ${SOURCE_MAP}`
SOURCE_MAP_DIR=`dirname ${SOURCE_MAP_REALPATH}`

ORIGINAL=${SOURCE_MAP_REALPATH}.ORIGINAL
MAPPED=${SOURCE_MAP_REALPATH}.MAPPED

cd ${SOURCE_MAP_DIR}
rm -f sources.list sources.json ${ORIGINAL} ${MAPPED}

cp ${SOURCE_MAP_REALPATH} ${ORIGINAL}

jq -r '.sources[]' < ${SOURCE_MAP_REALPATH} | while read SOURCE_FILE; do {
	if [ `basename ${SOURCE_FILE}` == "<stdout>" ]; then
		continue
	fi
	if [ ! -e ${SOURCE_FILE} ]; then
		echo "NOT FOUND" ${SOURCE_FILE}
		exit 1;
	fi

	echo Mapping ${SOURCE_FILE} ...

	SOURCE_FILE_REALPATH=`realpath ${SOURCE_FILE}`
	SOURCE_FILE_DIR=`dirname ${SOURCE_FILE_REALPATH}`
	MAPPED_PATH=mapped${SOURCE_FILE_REALPATH}

	mkdir -p mapped/${SOURCE_FILE_DIR}
	cp ${SOURCE_FILE} mapped/${SOURCE_FILE_DIR}

	echo ${MAPPED_PATH} >> sources.list
}; done;

jq -R . sources.list | jq -s . > sources.json
jq -c --slurpfile sources sources.json '.sources = $sources[0]' ${ORIGINAL} > ${MAPPED}

cp -rfv mapped/ ${DEST_DIR_REALPATH}
cp ${MAPPED} ${DEST_DIR_REALPATH}/${SOURCE_MAP_BASENAME}

