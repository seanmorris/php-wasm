#!/usr/bin/env make

CURL_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
CURL_SOURCE_STAMP?=third_party/php-wasm-curl/.php-wasm-source.json
curl_shell_quote = '$(subst ','"'"',$(1))'
DOCKER_RUN_IN_CURL_LIB=${DOCKER_ENV} -w /src/third_party/php-wasm-curl/ emscripten-builder
DOCKER_RUN_IN_EXT_CURL=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-curl/ emscripten-builder

.PHONY: curl-import-check
curl-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${CURL_SOURCE_STAMP}: SHELL := /bin/bash
${CURL_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${CURL_SOURCE_STAMP}: curl-import-check
ifdef CURL_DEV_PATH
	@node $(call curl_shell_quote,${CURL_IMPORTER}) snapshot $(call curl_shell_quote,${CURL_DEV_PATH}) $(call curl_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call curl_shell_quote,${CURL_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call curl_shell_quote,${CURL_IMPORTER}) stage $(call curl_shell_quote,${CURL_REPOSITORY}) $(call curl_shell_quote,${CURL_REF})
endif

lib/lib/libcurl.a: ${CURL_SOURCE_STAMP}
	@ echo -e "\e[33;4mBuilding php-wasm-curl (libcurl over fetch)\e[0m"
	${DOCKER_RUN_IN_CURL_LIB} make clean
	${DOCKER_RUN_IN_CURL_LIB} make install PREFIX=/src/lib CFLAGS='-O${SUB_OPTIMIZE} -flto'

third_party/php${PHP_VERSION}-curl/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/curl /src/third_party/php${PHP_VERSION}-curl
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-curl/config.m4

# configure's curl_easy_perform probe declares it as "char f()" and links with -g;
# the signature mismatch makes Binaryen's finalize step fail, so seed the answer.
CURL_CONFIGURE_CACHE=ac_cv_lib_curl_curl_easy_perform=yes

packages/curl/php${PHP_VERSION}-curl.so: ${PHPIZE} lib/lib/libcurl.a third_party/php${PHP_VERSION}-curl/config.m4
	@ echo -e "\e[33;4mBuilding php-curl\e[0m"
	${DOCKER_RUN_IN_EXT_CURL} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_CURL} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_CURL} sed -i 's#test -f "$$ac_f"#test -f "./$$ac_f"#' configure
	${DOCKER_RUN_IN_EXT_CURL} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} ${PHP_CONFIGURE_VARS} --prefix='/src/lib/php${PHP_VERSION}' --with-curl ${CURL_CONFIGURE_CACHE} --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_CURL} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_CURL} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_CURL} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/lib/include';
	${DOCKER_RUN_IN_EXT_CURL} emcc -shared -o /src/$@ -fPIC -flto ${SIDE_MODULE_FLAGS} -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/curl.a /src/lib/lib/libcurl.a
