#!/usr/bin/env make
# Built alongside the runtime; load the package through sharedLibs.
WITH_CURL?=dynamic

ifeq ($(filter ${WITH_CURL},0 1 static dynamic),)
$(error WITH_CURL MUST BE 0, 1, static, OR dynamic. WITH_CURL: '${WITH_CURL}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_CURL},1)
override WITH_CURL=dynamic
endif

CURL_REPOSITORY?=https://github.com/seanmorris/php-wasm-curl.git
CURL_BRANCH?=
CURL_REF?=$(or ${CURL_BRANCH},6085917954da9682c32ebcbea27a626d2308381b)
CURL_SOURCE_STAMP=third_party/php-wasm-curl/.php-wasm-source.json

ifeq (${WITH_CURL},static)
ARCHIVES+= lib/lib/libcurl.a
# Retain EM_JS-only objects such as the Digest helper in static builds.
WHOLE_ARCHIVES+= lib/lib/libcurl.a
PHP_CONFIGURE_DEPS+= lib/lib/libcurl.a
CONFIGURE_FLAGS+= --with-curl ac_cv_lib_curl_curl_easy_perform=yes
SKIP_LIBS+= -lcurl
TEST_LIST+=$(wildcard packages/curl/test/*.mjs)
endif

ifeq (${WITH_CURL},dynamic)
TEST_LIST+=$(wildcard packages/curl/test/*.mjs)
EXTRA_MODULES+= packages/curl/php${PHP_VERSION}-curl.so
endif
