#!/usr/bin/env make

WITH_ZLIB?=dynamic

ZLIB_TAG?=v1.3.1
DOCKER_RUN_IN_ZLIB=${DOCKER_ENV} -w /src/third_party/zlib/ emscripten-builder
DOCKER_RUN_IN_EXT_ZLIB=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-zlib/ emscripten-builder

ifeq ($(filter ${WITH_ZLIB},0 1 shared static dynamic),)
$(error WITH_ZLIB MUST BE 0, 1, static, shared, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_ZLIB},1)
WITH_ZLIB=static
endif

ifeq (${WITH_ZLIB},static)
CONFIGURE_FLAGS+= --with-zlib
ARCHIVES+= lib/lib/libz.a
TEST_LIST+=$(shell ls packages/zlib/test/*.mjs)
SKIP_LIBS+= -lz
endif

ifeq (${WITH_ZLIB},shared)
CONFIGURE_FLAGS+= --with-zlib
PHP_CONFIGURE_DEPS+= packages/zlib/libz.so
TEST_LIST+=$(shell ls packages/zlib/test/*.mjs)
SHARED_LIBS+= packages/zlib/libz.so
PHP_ASSET_LIST+= libz.so php${PHP_VERSION}-zlib.so
SKIP_LIBS+= -lz
endif

ifeq (${WITH_ZLIB},dynamic)
TEST_LIST+=$(shell ls packages/zlib/test/*.mjs)
DYNAMIC_LIBS+= packages/zlib/libz.so
DYNAMIC_LIBS_GROUPED+= zlib-libs
PHP_ASSET_LIST+= libz.so php${PHP_VERSION}-zlib.so
SKIP_LIBS+= -lz
endif

zlib-libs: packages/zlib/libz.so

third_party/zlib/.gitignore:
	@ echo -e "\e[33;4mDownloading Zlib\e[0m"
	${DOCKER_RUN} git clone https://github.com/madler/zlib.git third_party/zlib \
		--branch ${ZLIB_TAG} \
		--single-branch     \
		--depth 1;

lib/lib/libz.a: third_party/zlib/.gitignore
	@ echo -e "\e[33;4mBuilding ZLib\e[0m"
	${DOCKER_RUN_IN_ZLIB} emconfigure ./configure --prefix=/src/lib/ --static
	${DOCKER_RUN_IN_ZLIB} emmake make -j${CPU_COUNT} CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} '
	${DOCKER_RUN_IN_ZLIB} emmake make install
	${DOCKER_RUN_IN_ZLIB} chown -R $(or ${UID},1000):$(or ${GID},1000) ./

lib/lib/libz.so: lib/lib/libz.a
	${DOCKER_RUN_IN_ZLIB} emcc -shared -o /src/$@ -fPIC -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/zlib/libz.so: lib/lib/libz.so
	cp -Lp $^ $@

$(addsuffix /libz.so,$(sort ${SHARED_ASSET_PATHS})): packages/zlib/libz.so
	cp -Lp $^ $@

third_party/php${PHP_VERSION}-zlib/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/zlib /src/third_party/php${PHP_VERSION}-zlib
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-zlib/config.m4

packages/zlib/php${PHP_VERSION}-zlib.so: ${PHPIZE} packages/zlib/libz.so third_party/php${PHP_VERSION}-zlib/config.m4
	@ echo -e "\e[33;4mBuilding php-zlib\e[0m"
	${DOCKER_RUN_IN_EXT_ZLIB} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_ZLIB} cp config0.m4 config.m4
	${DOCKER_RUN_IN_EXT_ZLIB} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_ZLIB} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --with-zlib=/src/lib --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_ZLIB} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_ZLIB} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_ZLIB} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_ZLIB} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O0 -Wl,--whole-archive .libs/zlib.a /src/packages/zlib/libz.so

$(addsuffix /php${PHP_VERSION}-zlib.so,$(sort ${SHARED_ASSET_PATHS})): packages/zlib/php${PHP_VERSION}-zlib.so
	cp -Lp $^ $@
