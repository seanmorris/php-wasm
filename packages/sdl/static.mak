#!/usr/bin/env make

third_party/php${PHP_VERSION}-sdl/config.m4:
	@ echo -e "\e[33;4mDownloading ext-sdl\e[0m"
	${DOCKER_RUN} wget -q https://pecl.php.net/get/sdl-2.7.0.tgz
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


lib/lib/libSDL2.a:
	@ echo -e "\e[33;4mBuilding LIBSDL\e[0m"
	${DOCKER_RUN} embuilder.py build sdl2
#	${DOCKER_RUN} embuilder --pic --lto build sdl2
#	${DOCKER_RUN} cp /emsdk/upstream/emscripten/cache/sysroot/lib/wasm32-emscripten/lto-pic/libSDL2.a lib/lib/libSDL2.a
	${DOCKER_RUN_IN_LIB_SDL} ls -al
	${DOCKER_RUN_IN_LIB_SDL} chmod +x configure
	${DOCKER_RUN_IN_LIB_SDL} emconfigure ./configure --prefix=/src/lib/ --enable-shared=no --enable-static=yes --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_LIB_SDL} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_LIB_SDL} emmake make install
