#!/usr/bin/env make
WITH_WAITLINE?=0

ifeq (${WITH_WAITLINE},1)
WAITLINE_REPOSITORY?=https://github.com/seanmorris/waitline.git
WAITLINE_BRANCH?=
WAITLINE_REF?=$(or ${WAITLINE_BRANCH},acd126e69f56f281a9dccb0e4eea24786403f46d)
EXTRA_FLAGS+= -D WITH_WAITLINE=1
WAITLINE_SOURCE_STAMP=third_party/waitline/.php-wasm-source.json
WAITLINE_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/waitline/.php-wasm-source.json
PHP_CONFIGURE_DEPS+= ${WAITLINE_EXTENSION_STAMP}
CONFIGURE_FLAGS+= --enable-waitline
DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
CLI_DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
CGI_DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
DBG_DEPENDENCIES+= ${WAITLINE_EXTENSION_STAMP}
TEST_LIST+=$(wildcard packages/waitline/test/*.mjs)
# All TEST_LIST consumers run the ESM waitline tests, including CJS lanes.
test-node test-node-standard test-node-cjs test-node-cjs-standard test-deno: node-cli-mjs
endif
