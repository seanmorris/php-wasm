#!/usr/bin/env make

PDO_PGLITE_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
PDO_PGLITE_REPOSITORY?=https://github.com/seanmorris/pdo-pglite.git
PDO_PGLITE_REF?=2b048b370c94b9318179b0b55b195ef91870732c
PDO_PGLITE_SOURCE_STAMP?=third_party/pdo-pglite/.php-wasm-source.json
PDO_PGLITE_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/pdo_pglite/.php-wasm-source.json
pdo_pglite_shell_quote = '$(subst ','"'"',$(1))'
DOCKER_RUN_IN_EXT_PDO_PGLITE=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-pdo-pglite/ emscripten-builder

.PHONY: pdo-pglite-import-check
pdo-pglite-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${PDO_PGLITE_SOURCE_STAMP}: SHELL := /bin/bash
${PDO_PGLITE_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${PDO_PGLITE_SOURCE_STAMP}: pdo-pglite-import-check
ifdef PDO_PGLITE_DEV_PATH
	@node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) snapshot $(call pdo_pglite_shell_quote,${PDO_PGLITE_DEV_PATH}) $(call pdo_pglite_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) stage $(call pdo_pglite_shell_quote,${PDO_PGLITE_REPOSITORY}) $(call pdo_pglite_shell_quote,${PDO_PGLITE_REF})
endif

${PDO_PGLITE_EXTENSION_STAMP}: ${PDO_PGLITE_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore pdo-pglite-import-check
	@${DOCKER_RUN} node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) sync $(call pdo_pglite_shell_quote,${PHP_VERSION})

# Compatibility targets only verify imported files; the builder owns writes.
third_party/pdo-pglite/pdo_pglite.c third_party/pdo-pglite/config.m4 third_party/pdo-pglite/README.md: ${PDO_PGLITE_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/pdo_pglite/pdo_pglite.c third_party/php${PHP_VERSION}-src/ext/pdo_pglite/config.m4: ${PDO_PGLITE_EXTENSION_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-pdo-pglite/config.m4: ${PDO_PGLITE_EXTENSION_STAMP}
	${DOCKER_RUN} rm -rf /src/third_party/php${PHP_VERSION}-pdo-pglite
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/pdo_pglite /src/third_party/php${PHP_VERSION}-pdo-pglite

packages/pdo-pglite/php${PHP_VERSION}-pdo-pglite.so: ${PHPIZE} ${VRZNO_EXTENSION_STAMP} third_party/php${PHP_VERSION}-pdo-pglite/config.m4
	@ echo -e "\e[33;4mBuilding php-pdo-pglite\e[0m"
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} /src/third_party/php${PHP_VERSION}-src/scripts/phpize
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} emconfigure ./configure ${PHP_CONFIGURE_VARS} --prefix='/src/lib/php${PHP_VERSION}' --enable-pdo-pglite --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} sed -i 's#-shared#-static#g' Makefile
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} sed -i 's#-export-dynamic##g' Makefile
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} emmake make -j${CPU_COUNT} EXTRA_CFLAGS='-Wno-int-conversion -Wimplicit-function-declaration ${EXTRA_CFLAGS}' EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/third_party/php${PHP_VERSION}-src/ext/pdo_pglite -I/src/third_party/php${PHP_VERSION}-src/ext/vrzno -I/src/lib/include'
	${DOCKER_RUN_IN_EXT_PDO_PGLITE} emcc -shared -o /src/$@ -fPIC -flto ${SIDE_MODULE_FLAGS} -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/pdo_pglite.a
