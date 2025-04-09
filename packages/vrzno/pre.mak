#!/usr/bin/env make
WITH_VRZNO?=1

ifeq (${WITH_VRZNO},1)
VRZNO_BRANCH?=master
EXTRA_FLAGS+= -D WITH_VRZNO=1
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/vrzno/config.m4 # third_party/php${PHP_VERSION}-src/ext/vrzno/vrzno.c
CONFIGURE_FLAGS+= --enable-vrzno
# PRE_JS_FILES+= third_party/vrzno/lib.js
DEPENDENCIES+= third_party/vrzno/vrzno.c
CGI_DEPENDENCIES+= third_party/vrzno/vrzno.c
DBG_DEPENDENCIES+= third_party/vrzno/vrzno.c
TEST_LIST+=$(shell ls packages/vrzno/test/*.mjs)
endif

