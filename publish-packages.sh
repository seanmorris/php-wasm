#!/usr/bin/env bash

NPM_TAG=${1};
NOT_DRY_RUN=

if [ -z "${NPM_TAG}" ]; then {
	echo "A tag is required.";
	exit 1;}
fi

echo -e "Getting ready to publish to channel: \033[33m${NPM_TAG}\033[0m"

sleep 3;

# THIS SCRIPT SHOULD QUIT IMMEDIATELY UPON ERRORS
set -euo pipefail

ls packages | while read PACKAGE; do {

	if [[ ${PACKAGE} == "sdl" ]]; then
		continue;
	fi;

	echo -e "Checking package.json[files] in \033[1m${PACKAGE}\033[0m"

	cd "packages/${PACKAGE}"

	jq -r '.files | join("\n")' < package.json | while read FILE; do {

		if [[ ${FILE} == php8.[01234]* ]]; then
			continue;
		fi;

		if [[ ${FILE} == 'mapped/*' ]] || [[ ${FILE} == *.map ]]; then
			continue;
		fi;

		if [[ ${FILE} == '*.wasm' ]] || [[ ${FILE} == *.map ]]; then
			continue;
		fi;

		if [ ! -e ${FILE} ]; then
			echo -e "\033[31mMISSING ${FILE} in ${PACKAGE}!\033[0m"
			exit 1;
		fi;

	}; done;

	cd "../..";

}; done

set -euo pipefail

ls packages | while read PACKAGE; do {
	if [[ ${PACKAGE} == "sdl" ]]; then
		continue;
	fi;
	cd "packages/${PACKAGE}"
	echo -e "\033[33mChanged files in \033[1m${PACKAGE}:\033[0m";
	npm diff --tag ${NPM_TAG} --diff-name-only || ( cd ../.. && continue )
	if [[ "${NOT_DRY_RUN:-}" == "real" ]]; then
		set -x
		xyz publish --tag ${NPM_TAG}
		set +x
	else
		set -x
		npm publish --tag ${NPM_TAG} --dry-run
		set +x
	fi
	cd "../.."
}; done;
