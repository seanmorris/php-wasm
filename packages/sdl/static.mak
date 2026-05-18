#!/usr/bin/env make

DOCKER_RUN_IN_EXT_SDL=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY -sUSE_SDL=2' -w /src/third_party/php${PHP_VERSION}-sdl/ emscripten-builder

third_party/php${PHP_VERSION}-sdl/config.m4:
	@ echo -e "\e[33;4mDownloading ext-sdl\e[0m"
	${DOCKER_RUN} wget --tries=5 --waitretry=2 --timeout=20 -q https://pecl.php.net/get/sdl-2.7.0.tgz
	${DOCKER_RUN} tar -C third_party -xvzf sdl-2.7.0.tgz sdl-2.7.0
	${DOCKER_RUN} mv third_party/sdl-2.7.0 third_party/php${PHP_VERSION}-sdl
	${DOCKER_RUN} rm sdl-2.7.0.tgz
ifeq (${PHP_VERSION},8.5)
	${DOCKER_RUN_IN_EXT_SDL} find . -type f -exec perl -pi -e 's/zend_exception_get_default\(\)/zend_ce_exception/g;' {} +
endif

third_party/php${PHP_VERSION}-src/ext/sdl/config.m4: third_party/php${PHP_VERSION}-sdl/config.m4 | third_party/php${PHP_VERSION}-src/patched
	@ echo -e "\e[33;4mImporting ext-sdl\e[0m"
	${DOCKER_RUN} cp -rfv third_party/php${PHP_VERSION}-sdl third_party/php${PHP_VERSION}-src/ext/sdl
	${DOCKER_RUN} rm -rf third_party/php${PHP_VERSION}-src/ext/sdl/.libs third_party/php${PHP_VERSION}-src/ext/sdl/autom4te.cache third_party/php${PHP_VERSION}-src/ext/sdl/modules third_party/php${PHP_VERSION}-src/ext/sdl/build
	${DOCKER_RUN} find third_party/php${PHP_VERSION}-src/ext/sdl/src -type f \( -name '*.dep' -o -name '*.lo' \) -delete
	${DOCKER_RUN} rm -rf third_party/php${PHP_VERSION}-src/ext/sdl/src/.libs
	${DOCKER_RUN} find third_party/php${PHP_VERSION}-src/ext/sdl -maxdepth 1 -type f \( -name 'Makefile*' -o -name 'config.h' -o -name 'config.log' -o -name 'config.nice' -o -name 'config.status' -o -name 'configure' -o -name 'configure~' -o -name 'libtool' -o -name 'sdl.la' -o -name 'a.wasm' \) -delete
	${DOCKER_RUN} cp -fv third_party/php${PHP_VERSION}-src/ext/sdl/src/php_sdl.h third_party/php${PHP_VERSION}-src/ext/sdl/php_sdl.h

lib/bin/sdl2-config: packages/sdl/sdl2-config.in lib/lib/libSDL2.a lib/lib/libGL.a
	${DOCKER_RUN} mkdir -p /src/lib/bin
	${DOCKER_RUN} bash -lc "sed 's/@SDL_VERSION@/$(patsubst release-%,%,$(LIBSDL_TAG))/g' /src/packages/sdl/sdl2-config.in > /src/$@"
	${DOCKER_RUN} chmod +x /src/$@

lib/lib/libGL.a:
	@ echo -e "\e[33;4mBuilding LIBGL\e[0m"
	${DOCKER_RUN} embuilder build libGL-mt-webgl2-ofb-full_es3-getprocaddr --lto --pic --verbose
	${DOCKER_RUN} cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/lto-pic/libGL-mt-webgl2-ofb-full_es3-getprocaddr.a /src/$@

lib/lib/libSDL2.a:
	@ echo -e "\e[33;4mBuilding LIBSDL\e[0m"
	${DOCKER_RUN} embuilder build sdl2 --lto --pic --verbose
	${DOCKER_RUN} mkdir -p /src/lib/include /src/lib/lib
	${DOCKER_RUN} rm -rf /src/lib/include/SDL2
	${DOCKER_RUN} cp -r /emsdk/upstream/emscripten/cache/sysroot/include/SDL2 /src/lib/include/SDL2
	${DOCKER_RUN} cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/lto-pic/libSDL2.a /src/$@
