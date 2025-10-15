#!/usr/bin/env make

# WITH_SDL?=dynamic
WITH_SDL?=0

# LIBSDL_TAG?=release-2.28.4
# DOCKER_RUN_IN_LIB_SDL=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY' -w /emsdk/upstream/emscripten/cache/ports/sdl2/SDL-${LIBSDL_TAG} emscripten-builder
# DOCKER_RUN_IN_LIB_GL =${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY' -w /emsdk/upstream/emscripten/cache/ports/gl emscripten-builder
DOCKER_RUN_IN_EXT_SDL=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY -sUSE_SDL=2' -w /src/third_party/php${PHP_VERSION}-sdl/ emscripten-builder

## @ TODO: Implement static & shared builds
ifeq ($(filter ${WITH_SDL},0 1 dynamic),)
$(error WITH_SDL MUST BE 0, 1, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_SDL},static)
CONFIGURE_FLAGS+= --with-sdl
PHP_CONFIGURE_DEPS+= lib/lib/libSDL2.a third_party/php${PHP_VERSION}-src/ext/sdl/config.m4
TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
PHP_VARIANT:=${PHP_VARIANT}_sdl
# ARCHIVES+= lib/lib/libSDL2.a libGL.so
# SKIP_LIBS+= -lsdl -lgl
endif

ifeq (${WITH_SDL},shared)
CONFIGURE_FLAGS+= --with-sdl
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl/config.m4 packages/sdl/libSDL2.so packages/sdl/libGL.so
SHARED_LIBS+= packages/sdl/libSDL2.so packages/sdl/libGL.so
PHP_VARIANT:=${PHP_VARIANT}_sdl
# PHP_ASSET_LIST+= libSDL2.so libGL.so
# SKIP_LIBS+= -lsdl -lgl
endif

ifeq (${WITH_SDL},dynamic)
PHP_ASSET_LIST+= libSDL2.so libGL.so php${PHP_VERSION}-sdl.so
TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
PHP_VARIANT:=${PHP_VARIANT}_sdl
# SKIP_LIBS+= -lsdl -lgl
endif

third_party/php${PHP_VERSION}-sdl/config.m4:
	@ echo -e "\e[33;4mDownloading ext-sdl\e[0m"
	${DOCKER_RUN} wget -q https://pecl.php.net/get/sdl-2.7.0.tgz
	${DOCKER_RUN} tar -C third_party -xvzf sdl-2.7.0.tgz sdl-2.7.0
	${DOCKER_RUN} mv third_party/sdl-2.7.0 third_party/php${PHP_VERSION}-sdl
	${DOCKER_RUN} rm sdl-2.7.0.tgz

third_party/php${PHP_VERSION}-src/ext/sdl/config.m4: third_party/php${PHP_VERSION}-sdl/config.m4 | third_party/php${PHP_VERSION}-src/patched
	@ echo -e "\e[33;4mImporting ext-sdl\e[0m"
	${DOCKER_RUN} cp -rfv third_party/php${PHP_VERSION}-sdl third_party/php${PHP_VERSION}-src/ext/sdl
	${DOCKER_RUN} cp -rfv third_party/php${PHP_VERSION}-src/ext/sdl/src/* third_party/php${PHP_VERSION}-src/ext/sdl


lib/lib/libSDL2.a:
	@ echo -e "\e[33;4mBuilding LIBSDL\e[0m"
#	${DOCKER_RUN} embuilder --pic --lto build sdl2
#	${DOCKER_RUN} cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/lto-pic/libSDL2.a lib/lib/libSDL2.a
	${DOCKER_RUN_IN_LIB_SDL} ls -al
	${DOCKER_RUN_IN_LIB_SDL} chmod +x configure
	${DOCKER_RUN_IN_LIB_SDL} emconfigure ./configure --prefix=/src/lib/ --enable-shared=no --enable-static=yes --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_LIB_SDL} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_LIB_SDL} emmake make install

lib/lib/libGL.a:
	@ echo -e "\e[33;4mBuilding LIBGL\e[0m"
	${DOCKER_RUN} embuilder build libGL-mt-webgl2-ofb-full_es3-getprocaddr --lto --pic --verbose
	${DOCKER_RUN} cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/lto-pic/libGL-mt-webgl2-ofb-full_es3-getprocaddr.a /src/$@
#	${DOCKER_RUN} embuilder build USER
#	${DOCKER_RUN_IN_LIB_GL} ls -al ..
#	${DOCKER_RUN_IN_LIB_GL} ls -al .
#	${DOCKER_RUN_IN_LIB_GL} chmod +x configure
#	${DOCKER_RUN_IN_LIB_GL} emconfigure ./configure --prefix=/src/lib/ --enable-shared=no --enable-static=yes --cache-file=/tmp/config-cache
#	${DOCKER_RUN_IN_LIB_GL} emmake make -j${CPU_COUNT}
#	${DOCKER_RUN_IN_LIB_GL} emmake make install

lib/lib/libSDL2.so: lib/lib/libSDL2.a
	${DOCKER_RUN} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

lib/lib/libGL.so: lib/lib/libGL.a
	${DOCKER_RUN} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^


packages/sdl/libSDL2.so: lib/lib/libSDL2.so
	cp $^ $@

packages/sdl/libGL.so: lib/lib/libGL.so
	cp $^ $@

$(addsuffix /libSDL2.so,$(sort ${SHARED_ASSET_PATHS})): packages/sdl/libSDL2.so
	cp -Lp $^ $@

$(addsuffix /libGL.so,$(sort ${SHARED_ASSET_PATHS})): packages/sdl/libGL.so
	cp -Lp $^ $@

packages/sdl/php${PHP_VERSION}-sdl.so: ${PHPIZE} third_party/php${PHP_VERSION}-sdl/config.m4 packages/sdl/libSDL2.so # packages/sdl/libGL.so
	@ echo -e "\e[33;4mBuilding php-sdl\e[0m"
	${DOCKER_RUN_IN_EXT_SDL} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_SDL} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_SDL} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_SDL} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_SDL} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_SDL} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_SDL} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -sASYNCIFY -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/sdl.a
#	${DOCKER_RUN_IN_EXT_SDL} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -sASYNCIFY -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/sdl.a --use-port=sdl2 -sLEGACY_GL_EMULATION  

$(addsuffix /php${PHP_VERSION}-sdl.so,$(sort ${SHARED_ASSET_PATHS})): packages/sdl/php${PHP_VERSION}-sdl.so
	cp -Lp $^ $@
