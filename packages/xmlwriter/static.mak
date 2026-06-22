#!/usr/bin/env make

DOCKER_RUN_IN_EXT_XMLWRITER =${DOCKER_ENV} -e NOCONFIGURE=1 -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-xmlwriter/ emscripten-builder

WITH_XMLWRITER?=dynamic

ifeq ($(filter ${WITH_XMLWRITER},0 1 static dynamic),)
$(error WITH_XMLWRITER MUST BE 0, 1, static, OR dynamic. WITH_XMLWRITER: '${WITH_XMLWRITER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_XMLWRITER},1)
WITH_XMLWRITER=dynamic
endif

ifeq (${WITH_XMLWRITER},static)
ifeq ($(filter ${WITH_LIBXML},static),)
$(error WITH_XMLWRITER=static REQUIRES WITH_LIBXML=static. WITH_LIBXML: '${WITH_LIBXML}' WITH_XMLWRITER: '${WITH_XMLWRITER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
CONFIGURE_FLAGS+= --enable-xmlwriter
TEST_LIST+=$(shell ls packages/xmlwriter/test/*.mjs)
endif

ifeq (${WITH_XMLWRITER},dynamic)
ifeq ($(filter ${WITH_LIBXML},1 static shared dynamic),)
$(error WITH_XMLWRITER=dynamic REQUIRES WITH_LIBXML=[static|shared]. WITH_LIBXML: '${WITH_LIBXML}' WITH_XMLWRITER: '${WITH_XMLWRITER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
TEST_LIST+=$(shell ls packages/xmlwriter/test/*.mjs)
EXTRA_MODULES+= packages/xmlwriter/php${PHP_VERSION}-xmlwriter.so
endif

third_party/php${PHP_VERSION}-xmlwriter/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/xmlwriter /src/third_party/php${PHP_VERSION}-xmlwriter

packages/xmlwriter/php${PHP_VERSION}-xmlwriter.so: ${PHPIZE} third_party/php${PHP_VERSION}-xmlwriter/config.m4
	${DOCKER_RUN_IN_EXT_XMLWRITER} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_XMLWRITER} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_XMLWRITER} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config;
	${DOCKER_RUN_IN_EXT_XMLWRITER} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_XMLWRITER} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_XMLWRITER} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_XMLWRITER} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/xmlwriter.a /src/packages/libxml/libxml2.so
