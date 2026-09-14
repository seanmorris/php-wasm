#!/usr/bin/env make

PHP_CGI_DIST_DIR?=${ENV_DIR}/packages/php-cgi-wasm
PHP_CGI_ASSET_DIR?=${PHP_CGI_DIST_DIR}

ifdef PHP_BUILDER_DIR
PHP_CGI_DIST_DIR:=$(call builder_resolve_path,${PHP_CGI_DIST_DIR})
PHP_CGI_ASSET_DIR:=$(call builder_resolve_path,${PHP_CGI_ASSET_DIR})
endif

ifneq (${SHARED_ASSET_PATHS},${PHP_CGI_ASSET_DIR})
SHARED_ASSET_PATHS+= ${PHP_CGI_ASSET_DIR}
endif
