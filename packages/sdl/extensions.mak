#!/usr/bin/env make

SDL_IMAGE_VERSION=2.6.0
SDL_MIXER_VERSION=2.8.0
SDL_TTF_VERSION=2.20.2
SDL_NATIVE_CFLAGS=-fPIC -flto -O${SUB_OPTIMIZE}

ifeq (${WITH_OPENGL},1)
# SDL's main-module flags already select Emscripten's GL implementation.
SKIP_LIBS+= -lGL
endif

ifeq (${WITH_SDL_IMAGE},1)
ifneq ($(filter 0,${WITH_LIBPNG} ${WITH_LIBJPEG}),)
$(error WITH_SDL_IMAGE=1 requires WITH_LIBPNG and WITH_LIBJPEG to be static or shared)
endif
endif
ifeq (${WITH_SDL_TTF},1)
ifeq (${WITH_FREETYPE},0)
$(error WITH_SDL_TTF=1 requires WITH_FREETYPE to be static or shared)
endif
endif

# One codec provider per build. SDL uses the same artifacts as GD/zlib.
SDL_IMAGE_CODECS=$(if $(filter static,${WITH_LIBPNG}),lib/lib/libpng.a,packages/gd/libpng.so) $(if $(filter static,${WITH_LIBJPEG}),lib/lib/libjpeg.a,packages/gd/libjpeg.so) $(if $(filter 0 static,${WITH_ZLIB}),lib/lib/libz.a,packages/zlib/libz.so)
SDL_TTF_CODECS=$(if $(filter static,${WITH_FREETYPE}),lib/lib/libfreetype.a,packages/gd/libfreetype.so) $(if $(filter 0 static,${WITH_ZLIB}),lib/lib/libz.a,packages/zlib/libz.so)
ifeq (${WITH_SDL_IMAGE},1)
ARCHIVES+= lib/lib/libSDL2_image.a $(filter %.a,${SDL_IMAGE_CODECS})
SHARED_LIBS+= $(filter %.so,${SDL_IMAGE_CODECS})
PHP_CONFIGURE_DEPS+= ${SDL_IMAGE_CODECS}
SKIP_LIBS+= -lSDL2_image -lpng -lpng16 -ljpeg -lz
endif
ifeq (${WITH_SDL_MIXER},1)
ARCHIVES+= lib/lib/libSDL2_mixer.a
SKIP_LIBS+= -lSDL2_mixer
endif
ifeq (${WITH_SDL_TTF},1)
ARCHIVES+= lib/lib/libSDL2_ttf.a $(filter %.a,${SDL_TTF_CODECS})
SHARED_LIBS+= $(filter %.so,${SDL_TTF_CODECS})
PHP_CONFIGURE_DEPS+= ${SDL_TTF_CODECS}
SKIP_LIBS+= -lSDL2_ttf -lfreetype -lz
endif

# Match the existing PECL import recipes: download once per PHP source tree,
# then always apply patches to a fresh import, never an already patched tree.
define SDL_PECL
third_party/php$${PHP_VERSION}-$(1)/config.m4:
	$${DOCKER_RUN} /src/.github/bin/retry-download.sh https://pecl.php.net/get/$(1)-$(2).tgz third_party/php$${PHP_VERSION}-$(1).tgz
	$${DOCKER_RUN} mkdir -p third_party/php$${PHP_VERSION}-$(1)
	$${DOCKER_RUN} tar -xzf third_party/php$${PHP_VERSION}-$(1).tgz -C third_party/php$${PHP_VERSION}-$(1) --strip-components=1 $(1)-$(2)
	$${DOCKER_RUN} rm third_party/php$${PHP_VERSION}-$(1).tgz

third_party/php$${PHP_VERSION}-src/ext/$(1)/config.m4: third_party/php$${PHP_VERSION}-$(1)/config.m4 packages/sdl/patches/$(1).patch packages/sdl/extensions.mak $(3) $(4) | third_party/php$${PHP_VERSION}-src/patched
	$${DOCKER_RUN} rm -rf third_party/php$${PHP_VERSION}-$(1)-import
	$${DOCKER_RUN} cp -r third_party/php$${PHP_VERSION}-$(1) third_party/php$${PHP_VERSION}-$(1)-import
	$${DOCKER_RUN} patch --batch -d third_party/php$${PHP_VERSION}-$(1)-import -p1 -i /src/packages/sdl/patches/$(1).patch
	$(if $(3),$${DOCKER_RUN} cp $(3) third_party/php$${PHP_VERSION}-$(1)-import/,true)
	$(if $(4),$${DOCKER_RUN} cp $(4) third_party/php$${PHP_VERSION}-$(1)-import/src/,true)
	$(if $(filter sdl_mixer,$(1)),$${DOCKER_RUN} cp third_party/php$${PHP_VERSION}-$(1)-import/src/php_sdl_mixer.h third_party/php$${PHP_VERSION}-$(1)-import/php_sdl_mixer.h,true)
	$${DOCKER_RUN} rm -rf third_party/php$${PHP_VERSION}-src/ext/$(1)
	$${DOCKER_RUN} mv third_party/php$${PHP_VERSION}-$(1)-import third_party/php$${PHP_VERSION}-src/ext/$(1)
	$${DOCKER_RUN} touch $$@
endef
$(eval $(call SDL_PECL,sdl_image,0.4.0))
$(eval $(call SDL_PECL,sdl_mixer,0.4.0,$(wildcard packages/sdl/mixer/*.h),$(wildcard packages/sdl/mixer/src/*.[ch])))
$(eval $(call SDL_PECL,sdl_ttf,0.3.0,$(wildcard packages/sdl/ttf/*.[ch])))
$(eval $(call SDL_PECL,opengl,0.9.0,$(wildcard packages/sdl/opengl/*.[ch])))

define SDL_NATIVE
third_party/SDL2_$(1)-$(2)/configure: $(5)
	$${DOCKER_RUN} /src/.github/bin/retry-download.sh https://github.com/libsdl-org/SDL_$(1)/releases/download/release-$(2)/SDL2_$(1)-$(2).tar.gz third_party/SDL2_$(1)-$(2).tar.gz
	$${DOCKER_RUN} tar -xzf third_party/SDL2_$(1)-$(2).tar.gz -C third_party
	$(if $(5),$${DOCKER_RUN} patch --batch -d third_party/SDL2_$(1)-$(2) -p1 -i /src/$(5),true)
	$${DOCKER_RUN} rm third_party/SDL2_$(1)-$(2).tar.gz
	$${DOCKER_RUN} touch $$@

lib/lib/libSDL2_$(1).a: third_party/SDL2_$(1)-$(2)/configure lib/bin/sdl2-config packages/sdl/extensions.mak $(3)
	$${DOCKER_ENV} -w /src/third_party/SDL2_$(1)-$(2) emscripten-builder emconfigure ./configure PKG_CONFIG_PATH=$${PKG_CONFIG_PATH} --prefix=/src/lib --with-sdl-prefix=/src/lib --disable-sdltest --disable-shared --enable-static CFLAGS='$${SDL_NATIVE_CFLAGS}' LDFLAGS='-L/src/lib/lib -sASYNCIFY=$${ASYNCIFY}' CPPFLAGS='-I/src/lib/include' $(4)
	$${DOCKER_ENV} -w /src/third_party/SDL2_$(1)-$(2) emscripten-builder emmake make clean
	$${DOCKER_ENV} -w /src/third_party/SDL2_$(1)-$(2) emscripten-builder emmake make -j$${CPU_COUNT}
	$${DOCKER_ENV} -w /src/third_party/SDL2_$(1)-$(2) emscripten-builder emmake make install
endef
# libpng's ordinary pkg-config flags omit zlib, which static consumers also need.
$(eval $(call SDL_NATIVE,image,${SDL_IMAGE_VERSION},${SDL_IMAGE_CODECS},--disable-stb-image --enable-bmp --enable-jpg --enable-png --disable-jpg-shared --disable-png-shared --disable-save-jpg --disable-save-png --disable-avif --disable-gif --disable-jxl --disable-lbm --disable-pcx --disable-pnm --disable-svg --disable-tga --disable-tif --disable-xcf --disable-xpm --disable-xv --disable-webp --disable-qoi LIBPNG_LIBS='-L/src/lib/lib -lpng -lz',packages/sdl/patches/SDL2_image.patch))
$(eval $(call SDL_NATIVE,mixer,${SDL_MIXER_VERSION},,--enable-music-wave --enable-music-ogg --enable-music-ogg-stb --disable-music-ogg-vorbis --disable-music-ogg-tremor --disable-music-cmd --disable-music-mod --disable-music-midi --disable-music-gme --disable-music-flac --enable-music-mp3 --enable-music-mp3-minimp3 --disable-music-mp3-mpg123 --disable-music-opus --disable-music-wavpack,packages/sdl/patches/SDL2_mixer.patch))
$(eval $(call SDL_NATIVE,ttf,${SDL_TTF_VERSION},${SDL_TTF_CODECS},--disable-freetype-builtin --disable-harfbuzz --disable-harfbuzz-builtin FT2_CFLAGS='-I/src/lib/include/freetype2' FT2_LIBS='-L/src/lib/lib -lfreetype -lz'))
