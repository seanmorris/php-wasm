#!/usr/bin/env make
WITH_VRZNO?=1

ifeq (${WITH_VRZNO},1)
VRZNO_REPOSITORY?=https://github.com/seanmorris/vrzno.git
VRZNO_REF?=8f189484ee12c2d973b8825ca4297ca5813243a4
EXTRA_FLAGS+= -D WITH_VRZNO=1
VRZNO_SOURCE_STAMP=third_party/vrzno/.php-wasm-source.json
VRZNO_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/vrzno/.php-wasm-source.json
PHP_CONFIGURE_DEPS+= ${VRZNO_EXTENSION_STAMP}
CONFIGURE_FLAGS+= --enable-vrzno
# PRE_JS_FILES+= third_party/vrzno/lib.js
DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
CLI_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
CGI_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
DBG_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
TEST_LIST+=$(wildcard packages/vrzno/test/*.mjs)
endif
