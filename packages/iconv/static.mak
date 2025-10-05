#!/usr/bin/env make

WITH_ICONV?=dynamic

ICONV_TAG?=v1.17
DOCKER_RUN_IN_ICONV=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/libiconv-1.17/ emscripten-builder
DOCKER_RUN_IN_EXT_ICONV=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-iconv/ emscripten-builder

ifeq ($(filter ${WITH_ICONV},0 1 shared static dynamic),)
$(error WITH_ICONV MUST BE 0, 1, static, shared, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_ICONV},1)
WITH_ICONV=static
endif

ifeq (${WITH_ICONV},static)
CONFIGURE_FLAGS+= --with-iconv=/src/lib
ARCHIVES+= lib/lib/libiconv.a
SKIP_LIBS+= -liconv
TEST_LIST+=$(shell ls packages/iconv/test/*.mjs)
endif

ifeq (${WITH_ICONV},shared)
CONFIGURE_FLAGS+= --with-iconv=/src/lib
PHP_CONFIGURE_DEPS+= packages/iconv/libiconv.so
TEST_LIST+=$(shell ls packages/iconv/test/*.mjs)
SHARED_LIBS+= packages/iconv/libiconv.so
PHP_ASSET_LIST+= libiconv.so
SKIP_LIBS+= -liconv
endif

ifeq (${WITH_ICONV},dynamic)
PHP_CONFIGURE_DEPS+= packages/iconv/libiconv.so
PHP_ASSET_LIST+= libiconv.so php${PHP_VERSION}-iconv.so
TEST_LIST+=$(shell ls packages/iconv/test/*.mjs)
DYNAMIC_LIBS+= packages/iconv/libiconv.so
SKIP_LIBS+= -liconv
endif

third_party/libiconv-1.17/README:
	@ echo -e "\e[33;4mDownloading Iconv\e[0m"
	${DOCKER_RUN} wget -q https://ftp.gnu.org/pub/gnu/libiconv/libiconv-1.17.tar.gz
	${DOCKER_RUN} tar -xvzf libiconv-1.17.tar.gz -C third_party
	${DOCKER_RUN} rm libiconv-1.17.tar.gz

lib/lib/libiconv.a: third_party/libiconv-1.17/README
	@ echo -e "\e[33;4mBuilding Iconv\e[0m"
	${DOCKER_RUN_IN_ICONV} emconfigure ./configure --prefix=/src/lib/ --enable-shared=no --enable-static=yes --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_ICONV} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_ICONV} emmake make install
	${DOCKER_RUN_IN_ICONV} chown -R $(or ${UID},1000):$(or ${GID},1000) ./

lib/lib/libiconv.so: lib/lib/libiconv.a
	${DOCKER_RUN_IN_ICONV} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/iconv/libiconv.so: lib/lib/libiconv.so
	cp -Lp $^ $@

$(addsuffix /libiconv.so,$(sort ${SHARED_ASSET_PATHS})): packages/iconv/libiconv.so
	cp -Lp $^ $@

third_party/php${PHP_VERSION}-iconv/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/iconv /src/third_party/php${PHP_VERSION}-iconv
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-iconv/config.m4

packages/iconv/php${PHP_VERSION}-iconv.so: ${PHPIZE} packages/iconv/libiconv.so third_party/php${PHP_VERSION}-iconv/config.m4
	@ echo -e "\e[33;4mBuilding php-iconv\e[0m"
	${DOCKER_RUN_IN_EXT_ICONV} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_ICONV} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_ICONV} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --with-iconv=/src/lib --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_ICONV} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_ICONV} sed -i 's#-export-dynamic#-all-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_ICONV} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_ICONV} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/iconv.a /src/packages/iconv/libiconv.so

$(addsuffix /php${PHP_VERSION}-iconv.so,$(sort ${SHARED_ASSET_PATHS})): packages/iconv/php${PHP_VERSION}-iconv.so
	cp -Lp $^ $@
