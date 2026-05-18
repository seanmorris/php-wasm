#!/usr/bin/env make

DOCKER_RUN_IN_EXT_XMLREADER =${DOCKER_ENV} -e NOCONFIGURE=1 -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-xmlreader/ emscripten-builder

WITH_XMLREADER?=dynamic

ifeq ($(filter ${WITH_XMLREADER},0 1 static dynamic),)
$(error WITH_XMLREADER MUST BE 0, 1, static, OR dynamic. WITH_XMLREADER: '${WITH_XMLREADER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_XMLREADER},1)
WITH_XMLREADER=dynamic
endif

ifeq (${WITH_XMLREADER},static)
ifeq ($(filter ${WITH_LIBXML},static),)
$(error WITH_XMLREADER=static REQUIRES WITH_LIBXML=static. WITH_LIBXML: '${WITH_LIBXML}' WITH_XMLREADER: '${WITH_XMLREADER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
ifeq ($(filter ${WITH_DOM},static),)
$(error WITH_XMLREADER=static REQUIRES WITH_DOM=static. WITH_DOM: '${WITH_DOM}' WITH_XMLREADER: '${WITH_XMLREADER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
CONFIGURE_FLAGS+= --enable-xmlreader
TEST_LIST+=$(shell ls packages/xmlreader/test/*.mjs)
endif

ifeq (${WITH_XMLREADER},dynamic)
ifeq ($(filter ${WITH_LIBXML},1 static shared dynamic),)
$(error WITH_XMLREADER=dynamic REQUIRES WITH_LIBXML=[static|shared|dynamic]. WITH_LIBXML: '${WITH_LIBXML}' WITH_XMLREADER: '${WITH_XMLREADER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
ifeq ($(filter ${WITH_DOM},1 static shared dynamic),)
$(error WITH_XMLREADER=dynamic REQUIRES WITH_DOM=[static|shared|dynamic]. WITH_DOM: '${WITH_DOM}' WITH_XMLREADER: '${WITH_XMLREADER}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
TEST_LIST+=$(shell ls packages/xmlreader/test/*.mjs)
EXTRA_MODULES+= packages/xmlreader/php${PHP_VERSION}-xmlreader.so
endif

third_party/php${PHP_VERSION}-xmlreader/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/xmlreader /src/third_party/php${PHP_VERSION}-xmlreader

packages/xmlreader/php${PHP_VERSION}-xmlreader.so: ${PHPIZE} third_party/php${PHP_VERSION}-xmlreader/config.m4
	${DOCKER_RUN_IN_EXT_XMLREADER} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_XMLREADER} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_XMLREADER} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config;
	${DOCKER_RUN_IN_EXT_XMLREADER} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_XMLREADER} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_XMLREADER} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_XMLREADER} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/xmlreader.a /src/packages/libxml/libxml2.so
