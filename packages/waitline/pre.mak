#!/usr/bin/env make
WITH_WAITLINE?=0

ifeq ($(filter ${WITH_WAITLINE},0 1 static dynamic),)
$(error WITH_WAITLINE MUST BE 0, 1, static, OR dynamic. WITH_WAITLINE: '${WITH_WAITLINE}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_WAITLINE},1)
override WITH_WAITLINE=static
endif

ifneq (${WITH_WAITLINE},0)
WAITLINE_REPOSITORY?=https://github.com/seanmorris/waitline.git
WAITLINE_BRANCH?=
WAITLINE_REF?=$(or ${WAITLINE_BRANCH},94d7d7670de85b5b5018ed9f35206d56146efc0a)
WAITLINE_SOURCE_STAMP=third_party/waitline/.php-wasm-source.json
WAITLINE_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/waitline/.php-wasm-source.json
TEST_LIST+=$(wildcard packages/waitline/test/*.mjs)
# All TEST_LIST consumers run the ESM waitline tests, including CJS lanes.
test-node test-node-standard test-node-cjs test-node-cjs-standard test-deno test-bun test-bun-standard test-bun-cjs test-bun-cjs-standard: node-cli-mjs
endif

ifeq (${WITH_WAITLINE},static)
EXTRA_FLAGS+= -D WITH_WAITLINE=1
PHP_CONFIGURE_DEPS+= ${WAITLINE_EXTENSION_STAMP}
CONFIGURE_FLAGS+= --enable-waitline
DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
CLI_DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
CGI_DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
DBG_DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
endif

ifeq (${WITH_WAITLINE},dynamic)
EXTRA_MODULES+= packages/waitline/php${PHP_VERSION}-waitline.so
endif
