#!/usr/bin/env make
# Off until CI builds it by default. Build it
# from a local checkout with WITH_CURL=dynamic CURL_DEV_PATH=/path/to/php-wasm-curl.
WITH_CURL?=0

ifeq ($(filter ${WITH_CURL},0 1 static dynamic),)
$(error WITH_CURL MUST BE 0, 1, static, OR dynamic. WITH_CURL: '${WITH_CURL}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_CURL},1)
WITH_CURL=dynamic
endif

CURL_REPOSITORY?=https://github.com/seanmorris/php-wasm-curl.git
CURL_BRANCH?=
CURL_REF?=$(or ${CURL_BRANCH},71010885d9f7ef27dad8ee867e724fa97e8806b3)
CURL_SOURCE_STAMP=third_party/php-wasm-curl/.php-wasm-source.json

ifeq (${WITH_CURL},static)
ARCHIVES+= lib/lib/libcurl.a
PHP_CONFIGURE_DEPS+= lib/lib/libcurl.a
CONFIGURE_FLAGS+= --with-curl ac_cv_lib_curl_curl_easy_perform=yes
SKIP_LIBS+= -lcurl
TEST_LIST+=$(wildcard packages/curl/test/*.mjs)
endif

ifeq (${WITH_CURL},dynamic)
TEST_LIST+=$(wildcard packages/curl/test/*.mjs)
EXTRA_MODULES+= packages/curl/php${PHP_VERSION}-curl.so
endif
