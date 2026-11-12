#!/usr/bin/env make
WITH_VRZNO?=1

ifeq ($(filter ${WITH_VRZNO},0 1 static dynamic),)
$(error WITH_VRZNO MUST BE 0, 1, static, OR dynamic. WITH_VRZNO: '${WITH_VRZNO}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_VRZNO},1)
override WITH_VRZNO=static
endif

ifneq (${WITH_VRZNO},0)
VRZNO_REPOSITORY?=https://github.com/seanmorris/vrzno.git
VRZNO_REF?=f963f8c1ebb94fca2c5340fc82130183141776a5
VRZNO_SOURCE_STAMP=third_party/vrzno/.php-wasm-source.json
VRZNO_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/vrzno/.php-wasm-source.json
TEST_LIST+=$(wildcard packages/vrzno/test/*.mjs)
# The npm package ships a loader for every PHP version, so every profile can build
# the module those loaders name, also one that links the extension into its runtimes.
BRIDGE_MODULES+= packages/vrzno/php${PHP_VERSION}-vrzno.so
endif

ifeq (${WITH_VRZNO},static)
EXTRA_FLAGS+= -D WITH_VRZNO=1
PHP_CONFIGURE_DEPS+= ${VRZNO_EXTENSION_STAMP}
CONFIGURE_FLAGS+= --enable-vrzno
DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
CLI_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
CGI_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
DBG_DEPENDENCIES+= ${VRZNO_EXTENSION_STAMP}
endif

ifeq (${WITH_VRZNO},dynamic)
EXTRA_MODULES+= packages/vrzno/php${PHP_VERSION}-vrzno.so
endif
