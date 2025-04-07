#!/usr/bin/env make

WITH_GD?=dynamic
WITH_LIBPNG?=shared
WITH_LIBJPEG?=shared
WITH_FREETYPE?=shared
WITH_LIBWEBP?=shared

ifeq ($(filter ${WITH_GD},0 1 static dynamic),)
$(error WITH_GD MUST BE 0, 1, static, or dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_GD}, 1)
WITH_GD=static
endif

ifeq (${WITH_GD}, static)
CONFIGURE_FLAGS+= --enable-gd ${GD_FLAGS}
PHP_CONFIGURE_DEPS+= ${GD_LIBS}
TEST_LIST+= $(shell ls packages/gd/test/*.mjs)
endif

ifeq (${WITH_GD}, dynamic)
PHP_CONFIGURE_DEPS+= ${GD_LIBS}
PHP_ASSET_LIST+= php${PHP_VERSION}-gd.so
TEST_LIST+= $(shell ls packages/gd/test/*.mjs)
endif

GD_FLAGS=
GD_LIBS=

ifeq (${WITH_FREETYPE},shared)
GD_FLAGS+= --with-freetype=/src/lib
GD_LIBS+= packages/gd/libfreetype.so
ifeq (${WITH_GD}, static)
SHARED_LIBS+= packages/gd/libfreetype.so
endif
endif

ifeq (${WITH_LIBJPEG},shared)
GD_FLAGS+= --with-jpeg=/src/lib
GD_LIBS+= packages/gd/libjpeg.so
ifeq (${WITH_GD}, static)
SHARED_LIBS+= packages/gd/libjpeg.so
endif
endif

ifeq (${WITH_LIBPNG},shared)
GD_LIBS+= packages/gd/libpng.so
ifeq (${WITH_GD}, static)
SHARED_LIBS+= packages/gd/libpng.so
endif
endif

ifeq (${WITH_LIBWEBP},shared)
GD_FLAGS+= --with-webp=/src/lib
GD_LIBS+= packages/gd/libwebp.so
ifeq (${WITH_GD}, static)
SHARED_LIBS+= packages/gd/libwebp.so
endif
endif

DOCKER_RUN_IN_EXT_GD=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-gd/ emscripten-builder

FREETYPE_VERSION?=2.10.0
DOCKER_RUN_IN_FREETYPE=${DOCKER_ENV} -w /src/third_party/freetype-${FREETYPE_VERSION}/build emscripten-builder


JPEG_VERSION=v9f
DOCKER_RUN_IN_LIBJPEG=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/jpeg-9f/ emscripten-builder


LIBPNG_TAG?=v1.6.41
DOCKER_RUN_IN_LIBPNG=${DOCKER_ENV} -w /src/third_party/libpng/ emscripten-builder

LIBWEBP_TAG=1.4.0
DOCKER_RUN_IN_LIBWEBP=${DOCKER_ENV} -w /src/third_party/libwebp-${LIBWEBP_TAG}/ emscripten-builder

ifeq ($(filter ${WITH_FREETYPE},0 1 shared static),)
$(error WITH_FREETYPE MUST BE 0, 1, static OR shared. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_FREETYPE},1)
WITH_FREETYPE=static
endif

ifeq (${WITH_FREETYPE},static)
ARCHIVES+= lib/lib/libfreetype.a
CONFIGURE_FLAGS+= --with-freetype
TEST_LIST+= $(shell ls packages/gd/test/*.mjs)
SKIP_LIBS+= -lfreetype
endif

ifeq (${WITH_FREETYPE},shared)
PHP_ASSET_LIST+= libfreetype.so
SKIP_LIBS+= -lfreetype
endif



ifeq ($(filter ${WITH_LIBJPEG},0 1 shared static),)
$(error WITH_LIBJPEG MUST BE 0, 1, static OR shared. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_LIBJPEG},1)
WITH_LIBJPEG=static
endif

ifeq (${WITH_LIBJPEG},static)
ARCHIVES+= lib/lib/libjpeg.a
CONFIGURE_FLAGS+= --with-jpeg
SKIP_LIBS+= -ljpeg
endif

ifeq (${WITH_LIBJPEG},shared)
PHP_ASSET_LIST+= libjpeg.so
SKIP_LIBS+= -ljpeg
endif



ifeq ($(filter ${WITH_LIBPNG},0 1 shared static),)
$(error WITH_LIBPNG MUST BE 0, 1, static OR shared. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_LIBPNG},1)
WITH_LIBPNG=static
endif

ifeq (${WITH_LIBPNG},static)
ARCHIVES+= lib/lib/libpng.a
CONFIGURE_FLAGS+= --enable-png
SKIP_LIBS+= -lpng16
endif

ifeq (${WITH_LIBPNG},shared)
PHP_ASSET_LIST+= libpng.so
SKIP_LIBS+= -lpng16
endif




ifeq ($(filter ${WITH_LIBWEBP},0 1 shared static),)
$(error WITH_LIBWEBP MUST BE 0, 1, static OR shared. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_LIBWEBP},1)
WITH_LIBWEBP=static
endif

ifeq (${WITH_LIBWEBP},static)
ARCHIVES+= lib/lib/libwebp.a
CONFIGURE_FLAGS+= --with-webp
SKIP_LIBS+= -lwebp
endif

ifeq (${WITH_LIBWEBP},shared)
PHP_ASSET_LIST+= libwebp.so
SKIP_LIBS+= -lwebp
endif

third_party/php${PHP_VERSION}-gd/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/gd /src/third_party/php${PHP_VERSION}-gd
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-gd/config.m4

packages/gd/php${PHP_VERSION}-gd.so: ${PHPIZE} third_party/php${PHP_VERSION}-gd/config.m4 ${GD_LIBS}
	@ echo -e "\e[33;4mBuilding php-gd\e[0m"
	${DOCKER_RUN_IN_EXT_GD} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_GD} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_GD} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config='/src/lib/php${PHP_VERSION}/bin/php-config' ${GD_FLAGS} --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_GD} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_GD} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_GD} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_GD} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/gd.a $(addprefix /src/,${GD_LIBS})

$(addsuffix /php${PHP_VERSION}-gd.so,$(sort ${SHARED_ASSET_PATHS})): packages/gd/php${PHP_VERSION}-gd.so
	cp -Lp $^ $@

third_party/freetype-${FREETYPE_VERSION}/README:
	@ echo -e "\e[33;4mDownloading FREETYPE\e[0m"
	${DOCKER_RUN} wget -q https://download.savannah.gnu.org/releases/freetype/freetype-${FREETYPE_VERSION}.tar.gz
	${DOCKER_RUN} tar -xvzf freetype-${FREETYPE_VERSION}.tar.gz -C third_party
	${DOCKER_RUN} rm freetype-${FREETYPE_VERSION}.tar.gz

lib/lib/libfreetype.a: third_party/freetype-${FREETYPE_VERSION}/README lib/lib/libz.a
	@ echo -e "\e[33;4mBuilding FREETYPE\e[0m"
	${DOCKER_RUN} rm -rf third_party/freetype-${FREETYPE_VERSION}/build
	${DOCKER_RUN} mkdir third_party/freetype-${FREETYPE_VERSION}/build
	${DOCKER_RUN_IN_FREETYPE} emcmake cmake .. \
		-DCMAKE_INSTALL_PREFIX=/src/lib/ \
		-DCMAKE_C_FLAGS="-fPIC -flto -O${SUB_OPTIMIZE}"
	${DOCKER_RUN_IN_FREETYPE} bash -c 'echo "" > /src/third_party/freetype-${FREETYPE_VERSION}/build/CMakeFiles/freetype.dir/linklibs.rsp'
	${DOCKER_RUN_IN_FREETYPE} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_FREETYPE} emmake make install

lib/lib/libfreetype.so: lib/lib/libfreetype.a lib/lib/libpng.so lib/lib/libz.a
	@ echo -e "\e[33;4mBuilding FREETYPE\e[0m"
	${DOCKER_RUN} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/gd/libfreetype.so: lib/lib/libfreetype.so
	cp -Lp $^ $@

$(addsuffix /libfreetype.so,$(sort ${SHARED_ASSET_PATHS})): packages/gd/libfreetype.so
	cp -Lp $^ $@



third_party/jpeg-9f/README:
	@ echo -e "\e[33;4mDownloading LIBJPEG\e[0m"
	${DOCKER_RUN} wget -q https://ijg.org/files/jpegsrc.${JPEG_VERSION}.tar.gz
	${DOCKER_RUN} tar -xvzf jpegsrc.${JPEG_VERSION}.tar.gz -C third_party
	${DOCKER_RUN} rm jpegsrc.${JPEG_VERSION}.tar.gz

lib/lib/libjpeg.a: third_party/jpeg-9f/README
	@ echo -e "\e[33;4mBuilding LIBJPEG\e[0m"
	${DOCKER_RUN_IN_LIBJPEG} emconfigure ./configure --prefix=/src/lib/ --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_LIBJPEG} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_LIBJPEG} emmake make install

lib/lib/libjpeg.so: lib/lib/libjpeg.a
	${DOCKER_RUN} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/gd/libjpeg.so: lib/lib/libjpeg.so
	cp -rL $^ $@

$(addsuffix /libjpeg.so,$(sort ${SHARED_ASSET_PATHS})): packages/gd/libjpeg.so
	cp -Lp $^ $@



third_party/libpng/.gitignore:
	@ echo -e "\e[33;4mDownloading LIBPNG\e[0m"
	${DOCKER_RUN} git clone https://github.com/pnggroup/libpng.git third_party/libpng \
		--branch ${LIBPNG_TAG} \
		--single-branch     \
		--depth 1;

lib/lib/libpng.a: third_party/libpng/.gitignore lib/lib/libz.a
	@ echo -e "\e[33;4mBuilding LIBPNG\e[0m"
	${DOCKER_RUN_IN_LIBPNG} emcmake cmake . \
		-DCMAKE_INSTALL_PREFIX=/src/lib/ \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="-fPIC -flto -O${SUB_OPTIMIZE} " \
		-DZLIB_LIBRARY="/src/lib/lib/libz.a" \
		-DZLIB_INCLUDE_DIR="/src/lib/include/" \
		-DPNG_SHARED="ON"
	${DOCKER_RUN_IN_LIBPNG} emmake make -j1;
	${DOCKER_RUN_IN_LIBPNG} emmake make install;

lib/lib/libpng.so: third_party/libpng/.gitignore lib/lib/libz.so
	@ echo -e "\e[33;4mBuilding LIBPNG\e[0m"
	${DOCKER_RUN_IN_LIBPNG} emcmake cmake . \
		-DCMAKE_INSTALL_PREFIX=/src/lib/ \
		-DCMAKE_PROJECT_INCLUDE=/src/source/force-shared.cmake \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="-fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE}" \
		-DZLIB_LIBRARY="/src/lib/lib/libz.so" \
		-DZLIB_INCLUDE_DIR="/src/lib/include/" \
		-DPNG_SHARED="ON"
	${DOCKER_RUN_IN_LIBPNG} emmake make -j1;
	${DOCKER_RUN_IN_LIBPNG} emmake make install;

packages/gd/libpng.so: lib/lib/libpng.so
	cp -rL $^ $@

$(addsuffix /libpng.so,$(sort ${SHARED_ASSET_PATHS})): packages/gd/libpng.so
	cp -Lp $^ $@


third_party/libwebp-${LIBWEBP_TAG}/README.md:
	@ echo -e "\e[33;4mDownloading LIBWEBP\e[0m"
	${DOCKER_RUN} wget -q https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${LIBWEBP_TAG}.tar.gz
	${DOCKER_RUN} tar -xvzf libwebp-${LIBWEBP_TAG}.tar.gz -C third_party
	${DOCKER_RUN} rm libwebp-${LIBWEBP_TAG}.tar.gz

lib/lib/libwebp.so: lib/lib/libwebp.a
	${DOCKER_RUN} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

lib/lib/libwebp.a: third_party/libwebp-${LIBWEBP_TAG}/README.md
	@ echo -e "\e[33;4mBuilding LIBWEBP\e[0m"
	${DOCKER_RUN_IN_LIBWEBP} emconfigure ./configure --prefix=/src/lib/ --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_LIBWEBP} emmake make -f /src/packages/gd/webp.mak -j1
	${DOCKER_RUN_IN_LIBWEBP} emmake make -f /src/packages/gd/webp.mak install
	${DOCKER_RUN} rm /src/lib/lib/libwebp.so

packages/gd/libwebp.so: lib/lib/libwebp.so
	cp -rL $^ $@

$(addsuffix /libwebp.so,$(sort ${SHARED_ASSET_PATHS})): packages/gd/libwebp.so
	cp -Lp $^ $@
