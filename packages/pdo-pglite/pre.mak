#!/usr/bin/env make
WITH_PDO_PGLITE?=1

ifeq (${WITH_PDO_PGLITE}, 1)
WITH_VRZNO?=1
ifneq (${WITH_VRZNO},1)
$(error WITH_PDO_PGLITE=1 requires WITH_VRZNO=1)
endif

EXTRA_FLAGS+= -D WITH_PDO_PGLITE=1
PHP_CONFIGURE_DEPS+= third_party/pdo-pglite/config.m4  third_party/pdo-pglite/README.md
CONFIGURE_FLAGS+= --enable-pdo-pglite
DEPENDENCIES+= third_party/php${PHP_VERSION}-src/ext/pdo_pglite/pdo_pglite.c
CGI_DEPENDENCIES+=  third_party/php${PHP_VERSION}-src/ext/pdo_pglite/pdo_pglite.c
DBG_DEPENDENCIES+=  third_party/php${PHP_VERSION}-src/ext/pdo_pglite/pdo_pglite.c
TEST_LIST+=$(shell ls packages/pdo-pglite/test/*.mjs)
endif
