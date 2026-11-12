#!/usr/bin/env make

WAITLINE_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
WAITLINE_SOURCE_STAMP?=third_party/waitline/.php-wasm-source.json
WAITLINE_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/waitline/.php-wasm-source.json
waitline_shell_quote = '$(subst ','"'"',$(1))'
DOCKER_RUN_IN_EXT_WAITLINE=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-waitline/ emscripten-builder

.PHONY: waitline-import-check
waitline-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${WAITLINE_SOURCE_STAMP}: SHELL := /bin/bash
${WAITLINE_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${WAITLINE_SOURCE_STAMP}: waitline-import-check
ifdef WAITLINE_DEV_PATH
	@node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) snapshot $(call waitline_shell_quote,${WAITLINE_DEV_PATH}) $(call waitline_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) stage $(call waitline_shell_quote,${WAITLINE_REPOSITORY}) $(call waitline_shell_quote,${WAITLINE_REF})
endif

${WAITLINE_EXTENSION_STAMP}: ${WAITLINE_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore waitline-import-check
	@${DOCKER_RUN} node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) sync $(call waitline_shell_quote,${PHP_VERSION})

# Compatibility targets only verify imported files; the builder owns writes.
third_party/waitline/waitline.c third_party/waitline/config.m4: ${WAITLINE_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/waitline/waitline.c third_party/php${PHP_VERSION}-src/ext/waitline/config.m4: ${WAITLINE_EXTENSION_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-waitline/config.m4: ${WAITLINE_EXTENSION_STAMP}
	${DOCKER_RUN} rm -rf /src/third_party/php${PHP_VERSION}-waitline
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/waitline /src/third_party/php${PHP_VERSION}-waitline
	${DOCKER_RUN} touch /src/$@

packages/waitline/php${PHP_VERSION}-waitline.so: ${PHPIZE} third_party/php${PHP_VERSION}-waitline/config.m4
	@ echo -e "\e[33;4mBuilding php-waitline\e[0m"
	${DOCKER_RUN_IN_EXT_WAITLINE} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize
	${DOCKER_RUN_IN_EXT_WAITLINE} /src/third_party/php${PHP_VERSION}-src/scripts/phpize
	${DOCKER_RUN_IN_EXT_WAITLINE} emconfigure ./configure ${PHP_CONFIGURE_VARS} --prefix='/src/lib/php${PHP_VERSION}' --enable-waitline --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_EXT_WAITLINE} sed -i 's#-shared#-static#g' Makefile
	${DOCKER_RUN_IN_EXT_WAITLINE} sed -i 's#-export-dynamic##g' Makefile
	${DOCKER_RUN_IN_EXT_WAITLINE} emmake make -j${CPU_COUNT} EXTRA_CFLAGS='-Wno-int-conversion -Wimplicit-function-declaration ${EXTRA_CFLAGS}' EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/lib/include'
	${DOCKER_RUN_IN_EXT_WAITLINE} emcc -shared -o /src/$@ -fPIC -flto ${SIDE_MODULE_FLAGS} -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/waitline.a
