#!/usr/bin/env make

WITH_PHAR?=dynamic

ifeq ($(filter ${WITH_PHAR},0 1 static dynamic),)
$(error WITH_PHAR MUST BE 0, 1, static, dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_PHAR},1)
WITH_PHAR=static
endif

ifeq (${WITH_PHAR},static)
CONFIGURE_FLAGS+= --enable-phar
TEST_LIST+=packages/phar/test/basic.mjs
endif

ifeq (${WITH_PHAR},dynamic)
PHP_ASSET_LIST+= php${PHP_VERSION}-phar.so
TEST_LIST+=packages/phar/test/basic.mjs
endif

DOCKER_RUN_IN_EXT_PHAR=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-phar/ emscripten-builder

third_party/php${PHP_VERSION}-phar/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/phar /src/third_party/php${PHP_VERSION}-phar
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-phar/config.m4

packages/phar/php${PHP_VERSION}-phar.so: ${PHPIZE} third_party/php${PHP_VERSION}-phar/config.m4
	@ echo -e "\e[33;4mBuilding php-phar\e[0m"
	${DOCKER_RUN_IN_EXT_PHAR} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_PHAR} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_PHAR} sed -i 's|#define PHAR_MAIN 1|#define PHAR_MAIN 1\n#include "config.h"|g' phar.c;
	${DOCKER_RUN_IN_EXT_PHAR} sed -i 's#test -f "$$ac_f"#test -f "./$$ac_f"#' configure
	${DOCKER_RUN_IN_EXT_PHAR} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-openssl=/src/lib --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_PHAR} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_PHAR} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_PHAR} cp ../../packages/phar/phar.mak .
	${DOCKER_RUN_IN_EXT_PHAR} emmake make -f phar.mak -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/lib/include/';
	${DOCKER_RUN_IN_EXT_PHAR} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/phar.a

$(addsuffix /php${PHP_VERSION}-phar.so,$(sort ${SHARED_ASSET_PATHS})): packages/phar/php${PHP_VERSION}-phar.so
	cp -Lp $^ $@
