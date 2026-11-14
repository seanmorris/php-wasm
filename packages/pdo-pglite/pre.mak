#!/usr/bin/env make
WITH_PDO_PGLITE?=$(if $(filter 8.0,${PHP_VERSION}),0,1)

ifeq ($(filter ${WITH_PDO_PGLITE},0 1 static shared dynamic),)
$(error WITH_PDO_PGLITE MUST BE 0, 1, static, shared, OR dynamic. WITH_PDO_PGLITE: '${WITH_PDO_PGLITE}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_PDO_PGLITE},1)
override WITH_PDO_PGLITE=static
endif

# PGlite is a JavaScript provider, with no native support library to share.
# Match the shared profile's built-in PHP bindings using the static fallback.
ifeq (${WITH_PDO_PGLITE},shared)
override WITH_PDO_PGLITE=static
endif

ifneq (${WITH_PDO_PGLITE},0)
ifeq (${PHP_VERSION},8.0)
$(error PDO-PGlite requires PHP 8.1 or newer; use WITH_PDO_PGLITE=0 for PHP 8.0)
endif
WITH_VRZNO?=1
PDO_PGLITE_VRZNO_MODE:=$(if $(filter 1,${WITH_VRZNO}),static,${WITH_VRZNO})
ifeq ($(filter ${PDO_PGLITE_VRZNO_MODE},static dynamic),)
$(error WITH_PDO_PGLITE=${WITH_PDO_PGLITE} requires WITH_VRZNO=1, static, or dynamic)
endif
ifeq (${WITH_PDO_PGLITE},static)
ifneq (${PDO_PGLITE_VRZNO_MODE},static)
$(error WITH_PDO_PGLITE=static requires WITH_VRZNO=static)
endif
endif

PDO_PGLITE_SOURCE_STAMP=third_party/pdo-pglite/.php-wasm-source.json
PDO_PGLITE_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/pdo_pglite/.php-wasm-source.json
TEST_LIST+=$(wildcard packages/pdo-pglite/test/*.mjs)
endif

ifeq (${WITH_PDO_PGLITE},static)
EXTRA_FLAGS+= -D WITH_PDO_PGLITE=1
PHP_CONFIGURE_DEPS+= ${PDO_PGLITE_EXTENSION_STAMP}
CONFIGURE_FLAGS+= --enable-pdo-pglite
DEPENDENCIES+= ${PDO_PGLITE_EXTENSION_STAMP}
CLI_DEPENDENCIES+= ${PDO_PGLITE_EXTENSION_STAMP}
CGI_DEPENDENCIES+= ${PDO_PGLITE_EXTENSION_STAMP}
DBG_DEPENDENCIES+= ${PDO_PGLITE_EXTENSION_STAMP}
endif

ifeq (${WITH_PDO_PGLITE},dynamic)
EXTRA_MODULES+= packages/pdo-pglite/php${PHP_VERSION}-pdo-pglite.so
endif
