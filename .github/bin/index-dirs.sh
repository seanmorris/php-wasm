#!/usr/bin/env bash

set -euxo pipefail;

ROOT_URL_PATH='http://localhost:8080/'

FLAGS='-FCL 1'

cd packages/;

find . -type d | while read DIR; do {
	[[ "${DIR::-1}" == "pdo-cfd1" ]]   && continue;
	[[ "${DIR::-1}" == "pdo-pglite" ]] && continue;
	[[ "${DIR::-1}" == "vrzno" ]]      && continue;
	[[ "${DIR::-1}" == "waitline" ]]   && continue;

	test -d ${DIR} || continue;
	pushd ${DIR} > /dev/null;
	tree -H "" -I "index.html" ${FLAGS} -T 'php-wasm/'${DIR:2}/ > index.html;
	perl -pi -e 's#<a class="DIR" href="./">.</a><br>#<a class="DIR" href="../">..</a><br><a class="DIR" href="./">.</a><br>#' index.html
	perl -pi -e "s#^</p>#at $(date)</p>#" index.html
	perl -pi -e "s#\t</p>#\t<br /><br />php-wasm © 2021-$(date +%Y) Sean Morris</p>#" index.html
	popd > /dev/null;
}; done;

echo "{}" > dependencies.json

ls -d */ | while read DIR; do {
	[[ "${DIR::-1}" == "pdo-cfd1" ]]   && continue;
	[[ "${DIR::-1}" == "pdo-pglite" ]] && continue;
	[[ "${DIR::-1}" == "vrzno" ]]      && continue;
	[[ "${DIR::-1}" == "waitline" ]]   && continue;
	[[ "${DIR::-1}" == "." ]]          && continue;

	PACKAGE_NAME=$(jq -r '.name' ${DIR}/package.json)
	tar -czvf ${DIR::-1}.tar.gz ${DIR} > /dev/null
	jq --arg key "${PACKAGE_NAME}" --arg value "${ROOT_URL_PATH}${DIR::-1}.tar.gz" '.[$key] = $value' dependencies.json > temp.json && mv temp.json dependencies.json
}; done;

tree -H "" -I "index.html" ${FLAGS} -T 'php-wasm/' > index.html;
perl -pi -e "s#^</p>#at $(date)</p>#" index.html
perl -pi -e "s#\t</p>#\t<br /><br />php-wasm © 2021-$(date +%Y) Sean Morris</p>#" index.html

