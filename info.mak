#!/usr/bin/env make

.PHONY: get-asset-path get-php-version

ENV_FILE?=.env
-include ${ENV_FILE}

PHP_VERSION_DEFAULT=8.4
PHP_VERSION?=${PHP_VERSION_DEFAULT}

-include ${ENV_FILE}.${PHP_VERSION}

builder_resolve_path = $(if $(strip $(1)),$(if $(filter /% ~%,$(1)),$(1),$(abspath ${PHP_BUILDER_DIR}/$(1))))

ifdef PHP_BUILDER_DIR
ENV_DIR:=${PHP_BUILDER_DIR}
endif

PHP_DIST_DIR?=${ENV_DIR}/packages/php-wasm
PHP_ASSET_DIR?=${PHP_DIST_DIR}

ifdef PHP_BUILDER_DIR
PHP_ASSET_DIR:=$(call builder_resolve_path,${PHP_ASSET_DIR})
else
PHP_ASSET_DIR:=$(abspath ${PHP_ASSET_DIR})
endif

get-asset-path:
	@ echo $(abspath ${PHP_ASSET_DIR});

get-php-version:
	@ echo ${PHP_VERSION};
