#!/usr/bin/env make

WITH_FILEINFO?=dynamic

ifeq ($(filter ${WITH_FILEINFO},0 1 static dynamic),)
$(error WITH_FILEINFO MUST BE 0, 1, static, dynamic. WITH_FILEINFO: '${WITH_FILEINFO}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_FILEINFO},1)
WITH_FILEINFO=dynamic
EXTRA_MODULES+= packages/fileinfo/php${PHP_VERSION}-fileinfo.so
endif

ifeq (${WITH_FILEINFO},static)
CONFIGURE_FLAGS+= --enable-fileinfo
TEST_LIST+=packages/fileinfo/test/basic.mjs
EXTRA_MODULES+= packages/fileinfo/php${PHP_VERSION}-fileinfo.so
endif

ifeq (${WITH_FILEINFO},dynamic)
TEST_LIST+=packages/fileinfo/test/basic.mjs
EXTRA_MODULES+= packages/fileinfo/php${PHP_VERSION}-fileinfo.so
endif

DOCKER_RUN_IN_EXT_FILEINFO=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-fileinfo/ emscripten-builder

third_party/php${PHP_VERSION}-fileinfo/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/fileinfo /src/third_party/php${PHP_VERSION}-fileinfo
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-fileinfo/config.m4

packages/fileinfo/php${PHP_VERSION}-fileinfo.so: ${PHPIZE} third_party/php${PHP_VERSION}-fileinfo/config.m4
	@ echo -e "\e[33;4mBuilding php-fileinfo\e[0m"
	${DOCKER_RUN_IN_EXT_FILEINFO} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_FILEINFO} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_FILEINFO} sed -i 's#test -f "$$ac_f"#test -f "./$$ac_f"#' configure
	${DOCKER_RUN_IN_EXT_FILEINFO} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_FILEINFO} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_FILEINFO} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_FILEINFO} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_FILEINFO} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/fileinfo.a

$(addsuffix /php${PHP_VERSION}-fileinfo.so,$(sort ${SHARED_ASSET_PATHS})): packages/fileinfo/php${PHP_VERSION}-fileinfo.so
	cp -Lp $^ $@
