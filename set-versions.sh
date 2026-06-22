#!/usr/bin/env bash

set -eux;

NEW_VERSION=${1};

function updateFile
{
	local FILE=${1};
	local VERSION=${2};
	jq ".version = \"${VERSION}\"" "${FILE}" > ${FILE}.NEW
	mv ${FILE}.NEW ${FILE}
}

updateFile "package.json" ${NEW_VERSION};

ls packages | while read PACKAGE; do {
	test -d packages/${PACKAGE} || continue;
	updateFile "packages/${PACKAGE}/package.json" ${NEW_VERSION};
	cd "packages/${PACKAGE}";
	npm pkg fix;
	cd "../..";
}; done;
