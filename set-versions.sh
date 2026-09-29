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

function updateSiblingDeps
{
	local FILE=${1};
	local VERSION=${2};
	jq --argjson names "${SIBLINGS}" --arg range "^${VERSION}" '
		reduce ("dependencies", "peerDependencies") as $section (.;
			if has($section) then .[$section] |= with_entries(
				if (.key | IN($names[])) then .value = $range else . end
			) else . end
		)
	' "${FILE}" > ${FILE}.NEW
	mv ${FILE}.NEW ${FILE}
}

updateFile "package.json" ${NEW_VERSION};

SIBLINGS=$(jq -s '[.[].name]' packages/*/package.json);

ls packages | while read PACKAGE; do {
	test -d packages/${PACKAGE} || continue;
	updateFile "packages/${PACKAGE}/package.json" ${NEW_VERSION};
	updateSiblingDeps "packages/${PACKAGE}/package.json" ${NEW_VERSION};
	cd "packages/${PACKAGE}";
	npm pkg fix;
	cd "../..";
}; done;
