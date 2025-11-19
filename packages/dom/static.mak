#!/usr/bin/env make

DOCKER_RUN_IN_EXT_DOM =${DOCKER_ENV} -e NOCONFIGURE=1 -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-dom/ emscripten-builder

WITH_DOM?=dynamic

ifeq ($(filter ${WITH_DOM},0 1 static dynamic),)
$(error WITH_DOM MUST BE 0, 1, static, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_DOM},1)
WITH_DOM=static
endif

ifeq (${WITH_DOM},static)
ifeq ($(filter ${WITH_LIBXML},1 static),)
$(error WITH_DOM=static REQUIRES WITH_LIBXML=static. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
CONFIGURE_FLAGS+= --enable-dom
TEST_LIST+=$(shell ls packages/dom/test/*.mjs)
PHP_ASSET_LIST+= php${PHP_VERSION}-dom.so
endif

ifeq (${WITH_DOM},dynamic)
ifeq ($(filter ${WITH_LIBXML},1 static shared),)
$(error WITH_DOM=dynamic REQUIRES WITH_LIBXML=[static|shared]. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
TEST_LIST+=$(shell ls packages/dom/test/*.mjs)
PHP_ASSET_LIST+= php${PHP_VERSION}-dom.so
endif

third_party/php${PHP_VERSION}-dom/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/dom /src/third_party/php${PHP_VERSION}-dom
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-dom/config.m4

packages/dom/php${PHP_VERSION}-dom.so: ${PHPIZE} third_party/php${PHP_VERSION}-dom/config.m4
	${DOCKER_RUN_IN_EXT_DOM} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_DOM} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_DOM} sed -i 's|#include "php.h"|#include "config.h"\n#include "php.h"\n|g' php_dom.c;
	${DOCKER_RUN_IN_EXT_DOM} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config;
	${DOCKER_RUN_IN_EXT_DOM} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_DOM} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_DOM} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_DOM} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/dom.a /src/packages/libxml/libxml2.so

$(addsuffix /php${PHP_VERSION}-dom.so,$(sort ${SHARED_ASSET_PATHS})): packages/dom/php${PHP_VERSION}-dom.so
	cp -Lp $^ $@
