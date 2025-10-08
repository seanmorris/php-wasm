#!/usr/bin/env make

WITH_TIDY?=dynamic

TIDYHTML_TAG?=5.6.0
DOCKER_RUN_IN_TIDY=${DOCKER_ENV} -w /src/third_party/tidy-html5/ emscripten-builder
DOCKER_RUN_IN_EXT_TIDY=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-tidy/ emscripten-builder

ifeq ($(filter ${WITH_TIDY},0 1 shared static dynamic),)
$(error WITH_TIDY MUST BE 0, 1, static, shared OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_TIDY},1)
WITH_TIDY=static
endif

ifneq ($(filter ${WITH_TIDY},1 shared static),)
ifeq ($(filter ${WITH_LIBXML},1 shared static),)
$(error TIDY REQUIRES WITH_LIBXML=[1|share|static]. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
endif

ifeq (${WITH_TIDY},static)
CONFIGURE_FLAGS+= --with-tidy=/src/lib
ARCHIVES+= lib/lib/libtidy.a
TEST_LIST+=$(shell ls packages/tidy/test/*.mjs)
SKIP_LIBS+= -ltidy
endif

ifeq (${WITH_TIDY},shared)
CONFIGURE_FLAGS+= --with-tidy=/src/lib
PHP_CONFIGURE_DEPS+= packages/tidy/libtidy.so
TEST_LIST+=$(shell ls packages/tidy/test/*.mjs)
SHARED_LIBS+= packages/tidy/libtidy.so
PHP_ASSET_LIST+= libtidy.so php${PHP_VERSION}-tidy.so
SKIP_LIBS+= -ltidy
endif

ifeq (${WITH_TIDY},dynamic)
DYNAMIC_LIBS+= packages/tidy/libtidy.so
PHP_ASSET_LIST+= libtidy.so php${PHP_VERSION}-tidy.so
TEST_LIST+=$(shell ls packages/tidy/test/*.mjs)
SKIP_LIBS+= -ltidy
endif

third_party/tidy-html5/.gitignore:
	@ echo -e "\e[33;4mDownloading LibTidy\e[0m"
	${DOCKER_RUN} git clone https://github.com/htacg/tidy-html5.git third_party/tidy-html5 \
		--branch ${TIDYHTML_TAG} \
		--single-branch     \
		--depth 1;
	${DOCKER_RUN_IN_TIDY} git apply --no-index ../../patch/tidy-html.patch

lib/lib/libtidy.a: third_party/tidy-html5/.gitignore
	@ echo -e "\e[33;4mBuilding LibTidy\e[0m"
	${DOCKER_RUN_IN_TIDY} emcmake cmake . \
		-DCMAKE_INSTALL_PREFIX=/src/lib/ \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="-I/emsdk/upstream/emscripten/system/lib/libc/musl/include/ -fPIC "
	${DOCKER_RUN_IN_TIDY} emmake make -j`nproc`;
	${DOCKER_RUN_IN_TIDY} emmake make install;

lib/lib/libtidy.so: lib/lib/libtidy.a
	${DOCKER_RUN_IN_TIDY} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/tidy/libtidy.so: lib/lib/libtidy.so
	cp -rL $^ $@

$(addsuffix /libtidy.so,$(sort ${SHARED_ASSET_PATHS})): packages/tidy/libtidy.so
	cp -Lp $^ $@

third_party/php${PHP_VERSION}-tidy/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/tidy /src/third_party/php${PHP_VERSION}-tidy
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-tidy/config.m4

packages/tidy/php${PHP_VERSION}-tidy.so: ${PHPIZE} packages/tidy/libtidy.so third_party/php${PHP_VERSION}-tidy/config.m4
	@ echo -e "\e[33;4mBuilding php-tidy\e[0m"
	${DOCKER_RUN_IN_EXT_TIDY} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_TIDY} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_TIDY} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --with-tidy=/src/lib --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_TIDY} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_TIDY} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_TIDY} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_TIDY} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/tidy.a /src/packages/tidy/libtidy.so

$(addsuffix /php${PHP_VERSION}-tidy.so,$(sort ${SHARED_ASSET_PATHS})): packages/tidy/php${PHP_VERSION}-tidy.so
	cp -Lp $^ $@
