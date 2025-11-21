#!/usr/bin/env make

WITH_MBSTRING?=dynamic
WITH_ONIGURUMA?=dynamic

ONIGURUMA_TAG?=v6.9.9
DOCKER_RUN_IN_ONIGURUMA=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/oniguruma/ emscripten-builder
DOCKER_RUN_IN_EXT_MBSTRING=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-mbstring/ emscripten-builder

WITH_MBSTRING?=1

ifeq ($(filter ${WITH_MBSTRING},0 1 static dynamic),)
$(error WITH_MBSTRING MUST BE 0, 1, static, or dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_MBSTRING},1)
WITH_MBSTRING=static
EXTRA_MODULES+= packages/mbstring/php${PHP_VERSION}-mbstring.so
endif

ifeq (${WITH_MBSTRING},static)
CONFIGURE_FLAGS+= --with-mbstring
EXTRA_MODULES+= packages/mbstring/php${PHP_VERSION}-mbstring.so
endif

ifeq (${WITH_MBSTRING},dynamic)
EXTRA_MODULES+= packages/mbstring/php${PHP_VERSION}-mbstring.so
endif

ifeq ($(filter ${WITH_ONIGURUMA},0 1 shared static dynamic),)
$(error WITH_ONIGURUMA MUST BE 0, 1, static, shared, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_ONIGURUMA},1)
WITH_ONIGURUMA=static
endif

ifeq (${WITH_MBSTRING},dynamic)
ifeq ($(filter ${WITH_MBSTRING},shared dynamic),)
$(error WITH_ONIGURUMA MUST BE 0 OR shared IF WITH_MBSTRING IS shared OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
endif

ifeq (${WITH_ONIGURUMA},static)
ARCHIVES+= lib/lib/libonig.a
CONFIGURE_FLAGS+= --with-onig
SKIP_LIBS+= -lonig
EXTRA_MODULES+= packages/mbstring/libonig.so
endif

ifeq (${WITH_ONIGURUMA},shared)
CONFIGURE_FLAGS+= --with-onig
PHP_CONFIGURE_DEPS+= packages/mbstring/libonig.so
SHARED_LIBS+= packages/mbstring/libonig.so
SKIP_LIBS+= -lonig
EXTRA_MODULES+= packages/mbstring/libonig.so
endif

ifeq (${WITH_ONIGURUMA},dynamic)
DYNAMIC_LIBS+= packages/mbstring/libonig.so
DYNAMIC_LIBS_GROUPED+= mbstring-libs
SKIP_LIBS+= -lonig
EXTRA_MODULES+= packages/mbstring/libonig.so
endif

mbstring-libs: packages/mbstring/libonig.so

third_party/oniguruma/.gitignore:
	@ echo -e "\e[33;4mDownloading ONIGURUMA\e[0m"
	${DOCKER_RUN} git clone https://github.com/kkos/oniguruma.git third_party/oniguruma \
		--branch ${ONIGURUMA_TAG} \
		--single-branch     \
		--depth 1;

lib/lib/libonig.a: third_party/oniguruma/.gitignore
	@ echo -e "\e[33;4mBuilding ONIGURUMA\e[0m"
	${DOCKER_RUN_IN_ONIGURUMA} emconfigure ./autogen.sh
	${DOCKER_RUN_IN_ONIGURUMA} emconfigure ./configure --prefix=/src/lib/ --enable-shared=yes --enable-static=yes --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_ONIGURUMA} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_ONIGURUMA} emmake make install

lib/lib/libonig.so: lib/lib/libonig.a
	${DOCKER_RUN_IN_LIBZIP} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/mbstring/libonig.so: lib/lib/libonig.so
	cp -Lp $^ $@

$(addsuffix /libonig.so,$(sort ${SHARED_ASSET_PATHS})): packages/mbstring/libonig.so
	cp -Lp $^ $@

third_party/php${PHP_VERSION}-mbstring/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/mbstring /src/third_party/php${PHP_VERSION}-mbstring
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-mbstring/config.m4

packages/mbstring/php${PHP_VERSION}-mbstring.so: ${PHPIZE} third_party/php${PHP_VERSION}-mbstring/config.m4 packages/mbstring/libonig.so
	@ echo -e "\e[33;4mBuilding php-mbstring\e[0m"
	${DOCKER_RUN_IN_EXT_MBSTRING} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_MBSTRING} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_MBSTRING} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_MBSTRING} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_MBSTRING} sed -i 's#include "libmbfl/config.h"#include "config.h#g' Makefile;
	${DOCKER_RUN_IN_EXT_MBSTRING} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_MBSTRING} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O1 -Wl,--whole-archive .libs/mbstring.a /src/packages/mbstring/libonig.so

$(addsuffix /php${PHP_VERSION}-mbstring.so,$(sort ${SHARED_ASSET_PATHS})): packages/mbstring/php${PHP_VERSION}-mbstring.so
	cp -Lp $^ $@
