#!/usr/bin/env make

# WITH_SDL?=1
WITH_SDL?=0

ifeq ($(filter ${WITH_SDL},0 1 dynamic),)
$(error WITH_SDL MUST BE 0, 1, OR dynamic. WITH_SDL: '${WITH_SDL}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif
ifneq ($(words ${WITH_SDL}),1)
$(error WITH_SDL MUST BE 0, 1, OR dynamic)
endif

SDL_ENABLED=$(if $(filter ${WITH_SDL},1 dynamic),1,0)
WITH_SDL_IMAGE?=${SDL_ENABLED}
WITH_SDL_MIXER?=${SDL_ENABLED}
WITH_SDL_TTF?=${SDL_ENABLED}
WITH_OPENGL?=${SDL_ENABLED}

$(foreach option,WITH_SDL_IMAGE WITH_SDL_MIXER WITH_SDL_TTF WITH_OPENGL,$(if $(filter $(${option}),0 1),,$(error ${option} MUST BE 0 OR 1)))
$(foreach option,WITH_SDL_IMAGE WITH_SDL_MIXER WITH_SDL_TTF WITH_OPENGL,$(if $(filter 1,$(words $(${option}))),,$(error ${option} MUST BE 0 OR 1)))
ifeq (${SDL_ENABLED},0)
ifneq ($(filter 1,${WITH_SDL_IMAGE} ${WITH_SDL_MIXER} ${WITH_SDL_TTF} ${WITH_OPENGL}),)
$(error SDL add-ons require WITH_SDL=1)
endif
endif

ifneq ($(filter ${WITH_SDL},1 dynamic),)
WITH_SDL=1
CONFIGURE_FLAGS+= --with-sdl=/src/lib/bin/sdl2-config
EXTRA_FLAGS+= -sFULL_ES2 -sFULL_ES3 -lEGL -lGL
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl/config.m4 lib/bin/sdl2-config
ZEND_EXTRA_LIBS+= -lhtml5
TEST_LIST+=$(shell ls packages/sdl/test/*.mjs)
PHP_VARIANT:=${PHP_VARIANT}_sdl
endif

ifeq (${WITH_OPENGL},1)
CONFIGURE_FLAGS+= --with-opengl=/src/lib
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/opengl/config.m4
EXTRA_FLAGS+= -sMAX_WEBGL_VERSION=2
endif

ifeq (${WITH_SDL_IMAGE},1)
CONFIGURE_FLAGS+= --enable-sdl_image=/src/lib
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl_image/config.m4 lib/lib/libSDL2_image.a
endif
ifeq (${WITH_SDL_MIXER},1)
CONFIGURE_FLAGS+= --enable-sdl_mixer=/src/lib
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl_mixer/config.m4 lib/lib/libSDL2_mixer.a
endif
ifeq (${WITH_SDL_TTF},1)
CONFIGURE_FLAGS+= --enable-sdl_ttf=/src/lib
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/sdl_ttf/config.m4 lib/lib/libSDL2_ttf.a
endif
