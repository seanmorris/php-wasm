#!/usr/bin/env make

PHP_CLI_DIST_DIR?=${ENV_DIR}/packages/php-cli-wasm
PHP_CLI_ASSET_DIR?=${PHP_CLI_DIST_DIR}

ifdef PHP_BUILDER_DIR
PHP_CLI_DIST_DIR:=$(call builder_resolve_path,${PHP_CLI_DIST_DIR})
PHP_CLI_ASSET_DIR:=$(call builder_resolve_path,${PHP_CLI_ASSET_DIR})
endif

ifneq (${SHARED_ASSET_PATHS},${PHP_CLI_ASSET_DIR})
SHARED_ASSET_PATHS+= ${PHP_CLI_ASSET_DIR}
endif
