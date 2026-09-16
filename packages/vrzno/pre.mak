#!/usr/bin/env make
WITH_VRZNO?=1

ifeq (${WITH_VRZNO},1)
VRZNO_REPOSITORY?=https://github.com/seanmorris/vrzno.git
VRZNO_REF?=60f13ff220335a68aec67ba8541db7776e0af7e0
EXTRA_FLAGS+= -D WITH_VRZNO=1
VRZNO_SOURCE_STAMP=third_party/vrzno/.php-wasm-source.json
VRZNO_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/vrzno/.php-wasm-source.json
PHP_CONFIGURE_DEPS+= ${VRZNO_EXTENSION_STAMP}
CONFIGURE_FLAGS+= --enable-vrzno
DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
CLI_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
CGI_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
DBG_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
TEST_LIST+=$(wildcard packages/vrzno/test/*.mjs)
endif
