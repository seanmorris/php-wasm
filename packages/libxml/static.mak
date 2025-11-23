#!/usr/bin/env make

WITH_LIBXML?=dynamic

LIBXML2_TAG?=v2.9.10
DOCKER_RUN_IN_LIBXML =${DOCKER_ENV} -e NOCONFIGURE=1 -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/libxml2/ emscripten-builder
DOCKER_RUN_IN_EXT_LIBXML=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-libxml/ emscripten-builder

ifeq ($(filter ${WITH_LIBXML},0 1 static shared dynamic),)
$(error WITH_LIBXML MUST BE 0, 1, static, shared, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_LIBXML},1)
WITH_LIBXML=dynamic
endif

ifeq (${WITH_LIBXML},static)
ARCHIVES+= lib/lib/libxml2.a
CONFIGURE_FLAGS+= --with-libxml
TEST_LIST+=$(shell ls packages/libxml/test/*.mjs)
SKIP_LIBS+= -lxml2
EXTRA_MODULES+= packages/libxml/libxml2.so
endif

ifeq (${WITH_LIBXML},shared)
SHARED_LIBS+= packages/libxml/libxml2.so
CONFIGURE_FLAGS+= --with-libxml=/src/lib/
PHP_CONFIGURE_DEPS+= packages/libxml/libxml2.so
TEST_LIST+=$(shell ls packages/libxml/test/*.mjs)
SKIP_LIBS+= -lxml2
EXTRA_MODULES+= packages/libxml/libxml2.so
endif

ifeq (${WITH_LIBXML},dynamic)
# SHARED_LIBS+= packages/libxml/libxml2.so
CONFIGURE_FLAGS+= --with-libxml=/src/lib/
PHP_CONFIGURE_DEPS+= packages/libxml/libxml2.so
TEST_LIST+=$(shell ls packages/libxml/test/*.mjs)
SKIP_LIBS+= -lxml2
EXTRA_MODULES+= packages/libxml/libxml2.so
EXTRA_CFLAGS+= -D LIBXML_DYNAMIC_LOAD=1
DYNAMIC_LIBS_GROUPED+= xml-libs
endif

xml-libs: packages/libxml/libxml2.so

third_party/libxml2/.gitignore:
	@ echo -e "\e[33;4mDownloading LibXML2\e[0m"
	${DOCKER_RUN} git clone https://gitlab.gnome.org/GNOME/libxml2.git third_party/libxml2 \
		--branch ${LIBXML2_TAG} \
		--single-branch     \
		--depth 1;

lib/lib/libxml2.a: third_party/libxml2/.gitignore
	@ echo -e "\e[33;4mBuilding LibXML2\e[0m"
	${DOCKER_RUN_IN_LIBXML} ./autogen.sh
	${DOCKER_RUN_IN_LIBXML} emconfigure ./configure --with-http=no --with-ftp=no --with-python=no --with-threads=no --prefix=/src/lib/ --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_LIBXML} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_LIBXML} emmake make install

lib/lib/libxml2.so: lib/lib/libxml2.a
	${DOCKER_RUN_IN_LIBZIP} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/libxml/libxml2.so: lib/lib/libxml2.so
	cp -L $^ $@

$(addsuffix /libxml2.so,$(sort ${SHARED_ASSET_PATHS})): packages/libxml/libxml2.so
	cp -Lp $^ $@

## EXPERIMENTAL!!
third_party/php${PHP_VERSION}-libxml/config0.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/libxml /src/third_party/php${PHP_VERSION}-libxml
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-libxml/config0.m4

packages/libxml/php${PHP_VERSION}-libxml.so: ${PHPIZE} packages/libxml/libxml2.so third_party/php${PHP_VERSION}-xml/config.m4
	@ echo -e "\e[33;4mBuilding php-libxml\e[0m"
	${DOCKER_RUN_IN_EXT_LIBXML} cp config0.m4 config.m4
	${DOCKER_RUN_IN_EXT_LIBXML} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_LIBXML} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_LIBXML} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache --with-libxml=/src/lib;
	${DOCKER_RUN_IN_EXT_LIBXML} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_LIBXML} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_LIBXML} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_LIBXML} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/libxml.a /src/packages/libxml/libxml2.so
