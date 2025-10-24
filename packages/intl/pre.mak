#!/usr/bin/env make

WITH_INTL?=dynamic

LIBICU_VERSION_DOT=$(subst -,.,$(LIBICU_VERSION))
LIBICU_VERSION_UNDERSCORE=$(subst -,_,$(LIBICU_VERSION))

LIBICU_VERSION=72-1
LIBICU_TAG?=release-${LIBICU_VERSION}
LIBICU_DATFILE=lib/share/icu/${LIBICU_VERSION_DOT}/icudt72l.dat
DOCKER_RUN_IN_LIBICU=${DOCKER_ENV} -w /src/third_party/icu-${LIBICU_VERSION}/icu/source emscripten-builder
DOCKER_RUN_IN_EXT_INTL=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-intl emscripten-builder
DOCKER_RUN_IN_LIBICU_ALT=${DOCKER_ENV} -w /src/third_party/icu-${LIBICU_VERSION}/icu_alt/icu/source emscripten-builder
ifeq (${PHP_VERSION},7.4)
LIBICU_VERSION=69-1
LIBICU_DATFILE=lib/share/icu/69.1/icudt69l.dat
endif

ifeq ($(filter ${WITH_INTL},0 1 shared static dynamic),)
$(error WITH_INTL MUST BE 0, 1, static, shared, or dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_INTL},1)
WITH_INTL=static
endif

ifneq ($(filter ${WITH_INTL},shared static dynamic),)
PRE_JS_FILES+=packages/intl/env.js
TEST_LIST+=$(shell ls packages/intl/test/*.mjs)
# TEST_LIST+= packages/intl/test/basic.mjs $(addprefix packages/intl/test/,$(addsuffix .php${PHP_VERSION}.generated.mjs, badargs breakiter_clone_basic breakiter_first_basic breakiter_setText_basic calendar_add_basic calendar_get_basic))
endif

ifeq (${WITH_INTL},static)
PRELOAD_ASSETS+=${LIBICU_DATFILE}
CONFIGURE_FLAGS+=--enable-intl
EXTRA_FLAGS+=-DU_STATIC_IMPLEMENTATION
ARCHIVES+=lib/lib/libicudata.a lib/lib/libicui18n.a lib/lib/libicuio.a lib/lib/libicutest.a lib/lib/libicutu.a lib/lib/libicuuc.a
SKIP_LIBS+= -licuio -licui18n -licuuc -licudata
endif

ifeq (${WITH_INTL},shared)
PRELOAD_ASSETS+=${LIBICU_DATFILE}
CONFIGURE_FLAGS+=--enable-intl
PHP_CONFIGURE_DEPS+= packages/intl/libicudata.so packages/intl/libicui18n.so packages/intl/libicuio.so packages/intl/libicutest.so packages/intl/libicutu.so packages/intl/libicuuc.so
SHARED_LIBS+= packages/intl/libicudata.so packages/intl/libicui18n.so packages/intl/libicuio.so packages/intl/libicutest.so packages/intl/libicutu.so packages/intl/libicuuc.so
PHP_ASSET_LIST+= libicudata.so libicui18n.so libicuio.so libicutest.so libicutu.so libicuuc.so php${PHP_VERSION}-intl.so $(notdir ${LIBICU_DATFILE})
SKIP_LIBS+= -licuio -licui18n -licuuc -licudata
endif

ifeq (${WITH_INTL},dynamic)
SKIP_LIBS+= -licuio -licui18n -licuuc -licudata
DYNAMIC_LIBS+= packages/intl/libicudata.so packages/intl/libicui18n.so packages/intl/libicuio.so packages/intl/libicutest.so packages/intl/libicutu.so packages/intl/libicuuc.so
DYNAMIC_LIBS_GROUPED+= intl-libs
PHP_ASSET_LIST+= libicudata.so libicui18n.so libicuio.so libicutest.so libicutu.so libicuuc.so php${PHP_VERSION}-intl.so $(notdir ${LIBICU_DATFILE})
endif

intl-libs: packages/intl/libicudata.so packages/intl/libicui18n.so packages/intl/libicuio.so packages/intl/libicutest.so packages/intl/libicutu.so packages/intl/libicuuc.so