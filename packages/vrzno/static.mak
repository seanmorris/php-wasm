#!/usr/bin/env make

VRZNO_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
VRZNO_SOURCE_STAMP?=third_party/vrzno/.php-wasm-source.json
VRZNO_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/vrzno/.php-wasm-source.json
vrzno_shell_quote = '$(subst ','"'"',$(1))'
DOCKER_RUN_IN_EXT_VRZNO=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-vrzno/ emscripten-builder

.PHONY: vrzno-import-check
vrzno-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${VRZNO_SOURCE_STAMP}: SHELL := /bin/bash
${VRZNO_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${VRZNO_SOURCE_STAMP}: vrzno-import-check
ifdef VRZNO_DEV_PATH
	@node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) snapshot $(call vrzno_shell_quote,${VRZNO_DEV_PATH}) $(call vrzno_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) stage $(call vrzno_shell_quote,${VRZNO_REPOSITORY}) $(call vrzno_shell_quote,${VRZNO_REF})
endif

${VRZNO_EXTENSION_STAMP}: ${VRZNO_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore vrzno-import-check
	@${DOCKER_RUN} node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) sync $(call vrzno_shell_quote,${PHP_VERSION})

# Compatibility targets verify imported files without touching Docker-owned
# files on the host, or creating an empty source file to satisfy Make.
third_party/vrzno/vrzno.c: ${VRZNO_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/vrzno/vrzno.c third_party/php${PHP_VERSION}-src/ext/vrzno/config.m4: ${VRZNO_EXTENSION_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-vrzno/config.m4: ${VRZNO_EXTENSION_STAMP}
	${DOCKER_RUN} rm -rf /src/third_party/php${PHP_VERSION}-vrzno
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/vrzno /src/third_party/php${PHP_VERSION}-vrzno
	${DOCKER_RUN} touch /src/$@

packages/vrzno/php${PHP_VERSION}-vrzno.so: ${PHPIZE} third_party/php${PHP_VERSION}-vrzno/config.m4
	@ echo -e "\e[33;4mBuilding php-vrzno\e[0m"
	${DOCKER_RUN_IN_EXT_VRZNO} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize
	${DOCKER_RUN_IN_EXT_VRZNO} /src/third_party/php${PHP_VERSION}-src/scripts/phpize
	${DOCKER_RUN_IN_EXT_VRZNO} emconfigure ./configure ${PHP_CONFIGURE_VARS} --prefix='/src/lib/php${PHP_VERSION}' --enable-vrzno --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_EXT_VRZNO} sed -i 's#-shared#-static#g' Makefile
	${DOCKER_RUN_IN_EXT_VRZNO} sed -i 's#-export-dynamic##g' Makefile
	${DOCKER_RUN_IN_EXT_VRZNO} emmake make -j${CPU_COUNT} EXTRA_CFLAGS='-Wno-int-conversion -Wimplicit-function-declaration ${EXTRA_CFLAGS}' EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/third_party/php${PHP_VERSION}-src/ext/vrzno -I/src/lib/include'
	${DOCKER_RUN_IN_EXT_VRZNO} emcc -shared -o /src/$@ -fPIC -flto ${SIDE_MODULE_FLAGS} -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/vrzno.a
