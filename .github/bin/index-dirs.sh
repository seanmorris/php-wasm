#!/usr/bin/env bash

PACKAGES_DIR=${1}

set -euxo pipefail;

TREE_FLAGS='-FCL 1'

cd ${PACKAGES_DIR};

find . -type d | while read DIR; do {
	[[ "${DIR::-1}" == "pdo-cfd1" ]]   && continue;
	[[ "${DIR::-1}" == "pdo-pglite" ]] && continue;
	[[ "${DIR::-1}" == "vrzno" ]]      && continue;
	[[ "${DIR::-1}" == "waitline" ]]   && continue;

	test -d ${DIR} || continue;
	pushd ${DIR} > /dev/null;
	tree ${TREE_FLAGS} -H "" -I "index.html" -T 'php-wasm/nightly/'${DIR:2}/ > index.html;
	perl -pi -e 's#<a class="DIR" href="./">.</a><br>#<a class="DIR" href="../">..</a><br><a class="DIR" href="./">.</a><br>#' index.html
	perl -pi -e "s#^</head>#<style> html { background-color: black; } body { filter: invert(1); } </style></head>#" index.html
	perl -pi -e "s#^</p>#at $(date)</p>#" index.html
	perl -pi -e "s#\t</p>#\t<br /><br />php-wasm © 2021-$(date +%Y) Sean Morris</p>#" index.html
	popd > /dev/null;
}; done;

echo -n "" > all-libs.mjs

ls -d */ | while read DIR; do {
	[[ "${DIR::-1}" == "pdo-cfd1" ]]   && continue;
	[[ "${DIR::-1}" == "pdo-pglite" ]] && continue;
	[[ "${DIR::-1}" == "vrzno" ]]      && continue;
	[[ "${DIR::-1}" == "waitline" ]]   && continue;
	[[ "${DIR::-1}" == "." ]]          && continue;

	[[ ! -f "${DIR::-1}/index.mjs" ]] && continue;

	echo "export * as '${DIR::-1}' from './${DIR::-1}/index.mjs';" >> all-libs.mjs

}; done;

tree ${TREE_FLAGS} -H "" -T 'php-wasm/nightly/' -I "index.html" > index.html;
perl -pi -e "s#^</head>#<style> html { background-color: black; } body { filter: invert(1); } </style></head>#" index.html
perl -pi -e "s#^</p>#at $(date)</p>#" index.html
perl -pi -e "s#\t</p>#\t<br /><br />php-wasm © 2021-$(date +%Y) Sean Morris</p>#" index.html

