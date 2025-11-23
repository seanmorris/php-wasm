#!/usr/bin/env make

DOCKER_RUN_IN_EXT_SIMPLEXML =${DOCKER_ENV} -e NOCONFIGURE=1 -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-simplexml/ emscripten-builder

WITH_SIMPLEXML?=dynamic

ifeq ($(filter ${WITH_SIMPLEXML},0 1 static dynamic),)
$(error WITH_SIMPLEXML MUST BE 0, 1, static, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_SIMPLEXML},1)
WITH_XML=static
EXTRA_MODULES+= packages/simplexml/php${PHP_VERSION}-simplexml.so
endif

ifeq (${WITH_SIMPLEXML},static)
ifeq ($(filter ${WITH_LIBXML},1 static),)
$(error WITH_SIMPLEXML=static REQUIRES WITH_LIBXML=static. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
CONFIGURE_FLAGS+= --enable-simplexml
TEST_LIST+=$(shell ls packages/simplexml/test/*.mjs)
EXTRA_MODULES+= packages/simplexml/php${PHP_VERSION}-simplexml.so
endif

ifeq (${WITH_SIMPLEXML},dynamic)
ifeq ($(filter ${WITH_LIBXML},1 static shared dynamic),)
$(error WITH_SIMPLEXML=dynamic REQUIRES WITH_LIBXML=[static|shared]. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
TEST_LIST+=$(shell ls packages/simplexml/test/*.mjs)
EXTRA_MODULES+= packages/simplexml/php${PHP_VERSION}-simplexml.so
endif

third_party/php${PHP_VERSION}-simplexml/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lrf /src/third_party/php${PHP_VERSION}-src/ext/simplexml /src/third_party/php${PHP_VERSION}-simplexml
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-simplexml/config.m4

packages/simplexml/php${PHP_VERSION}-simplexml.so: ${PHPIZE} third_party/php${PHP_VERSION}-simplexml/config.m4
	${DOCKER_RUN_IN_EXT_SIMPLEXML} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_SIMPLEXML} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_SIMPLEXML} sed -i 's|#include "php.h"|#include "config.h"\n#include "php.h"\n|g' simplexml.c;
	${DOCKER_RUN_IN_EXT_SIMPLEXML} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config;
	${DOCKER_RUN_IN_EXT_SIMPLEXML} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_SIMPLEXML} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_SIMPLEXML} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_SIMPLEXML} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/simplexml.a /src/packages/libxml/libxml2.so

$(addsuffix /php${PHP_VERSION}-simplexml.so,$(sort ${SHARED_ASSET_PATHS})): packages/simplexml/php${PHP_VERSION}-simplexml.so
	cp -Lp $^ $@
