#!/usr/bin/env make

PHP_DBG_DIST_DIR?=${ENV_DIR}/packages/php-dbg-wasm
PHP_DBG_ASSET_DIR?=${PHP_DBG_DIST_DIR}

ifdef PHP_BUILDER_DIR
PHP_DBG_DIST_DIR:=$(call builder_resolve_path,${PHP_DBG_DIST_DIR})
PHP_DBG_ASSET_DIR:=$(call builder_resolve_path,${PHP_DBG_ASSET_DIR})
endif

ifneq (${SHARED_ASSET_PATHS},${PHP_DBG_ASSET_DIR})
SHARED_ASSET_PATHS+= ${PHP_DBG_ASSET_DIR}
endif
