#!/usr/bin/env make
WITH_WAITLINE?=0

ifeq (${WITH_WAITLINE},1)
WAITLINE_BRANCH?=master
EXTRA_FLAGS+= -D WITH_WAITLINE=1
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/waitline/config.m4 # third_party/php${PHP_VERSION}-src/ext/waitline/waitline.c
CONFIGURE_FLAGS+= --enable-waitline
DEPENDENCIES+= third_party/waitline/waitline.c
CGI_DEPENDENCIES+= third_party/waitline/waitline.c
# DBG_DEPENDENCIES+= third_party/waitline/waitline.c
# TEST_LIST+=$(shell ls packages/waitline/test/*.mjs)
endif

