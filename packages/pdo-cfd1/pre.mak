#!/usr/bin/env make
WITH_PDO_CFD1?=0

ifeq (${WITH_PDO_CFD1},1)
EXTRA_FLAGS+= -D WITH_PDO_CFD1=1
PHP_CONFIGURE_DEPS+= third_party/pdo-cfd1/config.m4
CONFIGURE_FLAGS+= --enable-pdo-cfd1
DEPENDENCIES+= third_party/php${PHP_VERSION}-src/ext/pdo_cfd1/pdo_cfd1.c
CGI_DEPENDENCIES+=  third_party/php${PHP_VERSION}-src/ext/pdo_cfd1/pdo_cfd1.c
DBG_DEPENDENCIES+=  third_party/php${PHP_VERSION}-src/ext/pdo_cfd1/pdo_cfd1.c
# TEST_LIST+=$(shell ls packages/pdo-cfd1/test/*.mjs)
endif
