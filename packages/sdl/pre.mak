#!/usr/bin/env make

# WITH_SDL?=dynamic
WITH_SDL?=0

LIBSDL_TAG?=release-2.28.4
DOCKER_RUN_IN_LIB_SDL=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY' -w /emsdk/upstream/emscripten/cache/ports/sdl2/SDL-${LIBSDL_TAG} emscripten-builder
DOCKER_RUN_IN_LIB_GL =${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY' -w /emsdk/upstream/emscripten/cache/ports/gl emscripten-builder
DOCKER_RUN_IN_EXT_SDL=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} -sASYNCIFY -sUSE_SDL=2' -w /src/third_party/php${PHP_VERSION}-sdl/ emscripten-builder

ifeq ($(filter ${WITH_SDL},0 1 shared static dynamic),)
$(error WITH_SDL MUST BE 0, 1, static, shared, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_SDL},1)
WITH_SDL=static
endif

ifeq (${WITH_SDL},static)
CONFIGURE_FLAGS+= --with-sdl
EXTRA_CFLAGS+= -sUSE_SDL=2 -sFULL_ES2 -sFULL_ES3 -lEGL -lGL -lSDL2
PHP_CONFIGURE_DEPS+= lib/lib/libSDL2.a third_party/php${PHP_VERSION}-src/ext/sdl/config.m4
# TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
# ARCHIVES+= lib/lib/libSDL2.a libGL.so
# SKIP_LIBS+= -lsdl -lgl
endif

# ifeq (${WITH_SDL},shared)
# CONFIGURE_FLAGS+= --with-sdl
# PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl/config.m4 packages/sdl/libSDL2.so packages/sdl/libGL.so
# TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
# SHARED_LIBS+= packages/sdl/libSDL2.so packages/sdl/libGL.so
# # PHP_ASSET_LIST+= libSDL2.so libGL.so
# # SKIP_LIBS+= -lsdl -lgl
# endif

ifeq (${WITH_SDL},dynamic)
EXTRA_CFLAGS+= --use-port=sdl2 -sFULL_ES2 -sFULL_ES3 -lEGL -lGL
PHP_ASSET_LIST+= libSDL2.so libGL.so php${PHP_VERSION}-sdl.so
TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
SKIP_LIBS+= -lsdl -lgl
endif
