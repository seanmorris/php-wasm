#!/usr/bin/env make

DOCKER_RUN_IN_EXT_XML =${DOCKER_ENV} -e NOCONFIGURE=1 -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-xml/ emscripten-builder

WITH_XML?=dynamic

ifeq ($(filter ${WITH_XML},0 1 static dynamic),)
$(error WITH_XML MUST BE 0, 1, static, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_XML},1)
WITH_XML=static
endif

ifeq (${WITH_XML},static)
ifeq ($(filter ${WITH_LIBXML},1 static),)
$(error WITH_XML=static REQUIRES WITH_LIBXML=static. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

CONFIGURE_FLAGS+= --enable-xml
TEST_LIST+=$(shell ls packages/xml/test/*.mjs)
endif

ifeq (${WITH_XML},dynamic)
ifeq ($(filter ${WITH_LIBXML},1 static shared),)
$(error WITH_XML=dynamic REQUIRES WITH_LIBXML=[static|shared]. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

TEST_LIST+=$(shell ls packages/xml/test/*.mjs)
PHP_ASSET_LIST+= php${PHP_VERSION}-xml.so
endif

third_party/php${PHP_VERSION}-xml/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/xml /src/third_party/php${PHP_VERSION}-xml
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-xml/config.m4

packages/xml/php${PHP_VERSION}-xml.so: ${PHPIZE} third_party/php${PHP_VERSION}-xml/config.m4
	${DOCKER_RUN_IN_EXT_XML} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_XML} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_XML} sed -i 's|#include "php.h"|#include "config.h"\n#include "php.h"\n|g' xml.c;
	${DOCKER_RUN_IN_EXT_XML} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config;
	${DOCKER_RUN_IN_EXT_XML} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_XML} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_XML} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_XML} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/xml.a /src/packages/libxml/libxml2.so

$(addsuffix /php${PHP_VERSION}-xml.so,$(sort ${SHARED_ASSET_PATHS})): packages/xml/php${PHP_VERSION}-xml.so
	cp -Lp $^ $@
