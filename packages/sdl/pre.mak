#!/usr/bin/env make

# WITH_SDL?=1
WITH_SDL?=0

LIBSDL_TAG?=release-2.28.4
DOCKER_RUN_IN_LIB_SDL=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY' -w /emsdk/upstream/emscripten/cache/ports/sdl2/SDL-${LIBSDL_TAG} emscripten-builder

ifeq ($(filter ${WITH_SDL},0 1 dynamic),)
$(error WITH_SDL MUST BE 0, 1, OR dynamic. WITH_SDL: '${WITH_SDL}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifneq ($(filter ${WITH_SDL},1 dynamic),)
WITH_SDL=1
CONFIGURE_FLAGS+= --with-sdl=/src/lib/bin/sdl2-config
EXTRA_FLAGS+= --use-port=sdl2 -sFULL_ES2 -sFULL_ES3 -lEGL -lGL
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl/config.m4 lib/bin/sdl2-config
ZEND_EXTRA_LIBS+= -lhtml5
TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
PHP_VARIANT:=${PHP_VARIANT}_sdl
endif
