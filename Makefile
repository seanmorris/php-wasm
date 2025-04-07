#!/usr/bin/env make
.PHONY: all web js cjs mjs clean php-clean deep-clean show-ports show-versions show-files hooks image push-image pull-image dist demo serve-demo scripts test archives assets packages/php-wasm/config.mjs packages/php-cg-wasm/config.mjs rebuild

MAKEFLAGS += --no-builtin-rules --no-builtin-variables

## Defaults:

ENV_DIR?=.
ENV_FILE?=.env
-include ${ENV_FILE}
-include ${ENV_FILE}.${PHP_VERSION}

## Default libraries
WITH_BCMATH  ?=1
WITH_CALENDAR?=1
WITH_CTYPE   ?=1
WITH_EXIF    ?=1
WITH_FILTER  ?=1
WITH_SESSION ?=1
WITH_TOKENIZER?=1

SKIP_SHARED_LIBS?=0

ifeq ($(filter ${WITH_BCMATH},0 1),)
$(error WITH_BCMATH MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_CALENDAR},0 1),)
$(error WITH_CALENDAR MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_CTYPE},0 1),)
$(error WITH_CTYPE MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_EXIF},0 1),)
$(error WITH_EXIF MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_FILTER},0 1),)
$(error WITH_FILTER MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_SESSION},0 1),)
$(error WITH_SESSION MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_TOKENIZER},0 1),)
$(error WITH_TOKENIZER MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

WITH_LIBXML?=shared

## Emscripten features...
NODE_RAW_FS ?=0
WITH_NETWORKING?=0

ifeq ($(filter ${NODE_RAW_FS},0 1),)
$(error NODE_RAW_FS MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${WITH_NETWORKING},0 1),)
$(error WITH_NETWORKING MUST BE 0, 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

## Compression
GZIP   ?=0
BROTLI ?=0

ifeq ($(filter ${GZIP},0 1),)
$(error GZIP MUST BE 0 or 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq ($(filter ${BROTLI},0 1),)
$(error BROTLI MUST BE 0, 1. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

## PHP Version
PHP_VERSION?=${PHP_VERSION_DEFAULT}

ifeq ($(filter ${PHP_VERSION},8.4 8.3 8.2 8.1 8.0),)
$(error PHP_VERSION MUST BE 8.4, 8.3, 8.2, 8.1 or 8.0. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

## More Options
ifdef PHP_BUILDER_DIR
ENV_DIR:=${PHP_BUILDER_DIR}
PHP_DIST_DIR:=$(realpath ${ENV_DIR}/${PHP_DIST_DIR})
PHP_ASSET_DIR:=$(realpath ${ENV_DIR}/${PHP_ASSET_DIR})
endif
PHP_DIST_DIR?=${ENV_DIR}/packages/php-wasm
INITIAL_MEMORY ?=128MB
MAXIMUM_MEMORY ?=4096MB
ASSERTIONS     ?=0
SYMBOLS        ?=0
OPTIMIZE       ?=3
SUB_OPTIMIZE   ?=${OPTIMIZE}
PHP_SUFFIX ?=
WITH_SOURCEMAPS?=0

## End of defaults

ifeq (${WITH_SOURCEMAPS},1)
	SYMBOLS+= -gsource-map
endif

_UID:=$(shell id -u)
_GID:=$(shell id -g)
UID?=${_UID}
GID?=${_GID}

SHELL=bash -euo pipefail

PKG_CONFIG_PATH=/src/lib/lib/pkgconfig

DOCKER_COMPOSE?=docker-compose
CPU_COUNT=`nproc || echo 1`
DOCKER_ENV=PHP_DIST_DIR=$(realpath ${PHP_DIST_DIR}) ${DOCKER_COMPOSE} -p phpwasm run -T --rm -e PKG_CONFIG_PATH=${PKG_CONFIG_PATH} -e OUTER_UID=${UID}
DOCKER_RUN=${DOCKER_ENV} emscripten-builder
DOCKER_RUN_IN_PHP=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-src/ emscripten-builder

PHP_VERSION_DEFAULT=8.3

WITH_CGI=1

PHP_CONFIGURE_DEPS=
DEPENDENCIES=
ORDER_ONLY=
EXTRA_FILES=
CONFIGURE_FLAGS?=
EXTRA_FLAGS?=
PHP_ARCHIVE_DEPS=third_party/php${PHP_VERSION}-src/configured third_party/php${PHP_VERSION}-src/patched
ARCHIVES=
SHARED_LIBS=
PRE_JS_FILES=source/env.js
EXTRA_PRE_JS_FILES?=
PHPIZE=third_party/php${PHP_VERSION}-src/scripts/phpize

PRE_JS_FILES+= ${EXTRA_PRE_JS_FILES}

TEST_LIST=

ifeq (${PHP_VERSION},8.4)
PHP_VERSION_FULL=8.4.1
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp
endif

ifeq (${PHP_VERSION},8.3)
PHP_VERSION_FULL=8.3.11
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp
endif

ifeq (${PHP_VERSION},8.2)
PHP_VERSION_FULL=8.2.11
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp
endif

ifeq (${PHP_VERSION},8.1)
PHP_VERSION_FULL=8.1.28
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp
endif

ifeq (${PHP_VERSION},8.0)
PHP_VERSION_FULL=8.0.30
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp
endif

ifeq (${PHP_VERSION},7.4)
PHP_VERSION_FULL=7.4.28
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp7
EXTRA_FLAGS+= -s EMULATE_FUNCTION_POINTER_CASTS=1
endif

EXTRA_CFLAGS=
ZEND_EXTRA_LIBS=
SKIP_LIBS=
PHP_ASSET_LIST=
PHP_ASSET_DIR?=${PHP_DIST_DIR}
SHARED_ASSET_PATHS=${PHP_ASSET_DIR}

ifneq (${PHP_ASSET_DIR},${PHP_DIST_DIR})
PHP_ASSET_LIST+=
endif

PRELOAD_NAME=php
NOTPARALLEL=

all:
	$(MAKE) _all
	$(MAKE) cgi-all
	$(MAKE) dbg-all

-include packages/php-cgi-wasm/pre.mak
-include packages/php-dbg-wasm/pre.mak
-include $(addsuffix /pre.mak,$(shell npm ls -p))

ifneq (${PRELOAD_ASSETS},)
# DEPENDENCIES+=
PHP_ASSET_LIST+= ${PRELOAD_NAME}.data
ORDER_ONLY+=.cache/preload-collected
EXTRA_FLAGS+= --preload-name ${PRELOAD_NAME} ${PRELOAD_METHOD} /src/third_party/preload@/preload
endif

-include $(addsuffix /static.mak,$(shell npm ls -p))
-include packages/php-cgi-wasm/static.mak
-include packages/php-dbg-wasm/static.mak

########### Collect & patch the source code. ###########

third_party/php${PHP_VERSION}-src/patched: third_party/php${PHP_VERSION}-src/.gitignore
	${DOCKER_RUN} git apply --no-index patch/php${PHP_VERSION}.patch
	${DOCKER_RUN} mkdir -p third_party/php${PHP_VERSION}-src/preload/Zend
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/patched

.cache/preload-collected: third_party/php${PHP_VERSION}-src/patched ${PRELOAD_ASSETS} ${ENV_FILE}
	${DOCKER_RUN} rm -rf /src/third_party/preload
ifneq (${PRELOAD_ASSETS},)
	@ mkdir -p third_party/preload
ifdef PHP_BUILDER_DIR
	@ cp -prfL $(addprefix ${PHP_BUILDER_DIR},${PRELOAD_ASSETS}) third_party/preload/
else
	@ cp -prfL ${PRELOAD_ASSETS} third_party/preload/
endif
	@ ${DOCKER_RUN} touch .cache/preload-collected
endif

third_party/php${PHP_VERSION}-src/.gitignore:
	@ echo -e "\e[33;4mDownloading and patching PHP\e[0m"
	${DOCKER_RUN} git clone https://github.com/php/php-src.git third_party/php${PHP_VERSION}-src \
		--branch ${PHP_BRANCH}   \
		--single-branch          \
		--depth 1

third_party/php${PHP_VERSION}-src/ext/pib/pib.c: source/pib/pib.c
	@ ${DOCKER_RUN} cp -prf source/pib third_party/php${PHP_VERSION}-src/ext/

########### Build the objects. ###########

ifneq (${WITH_NETWORKING},0)
EXTRA_FLAGS+= -lwebsocket.js
endif

ifneq (${WITH_BCMATH},0)
CONFIGURE_FLAGS+= --enable-bcmath
endif

ifneq (${WITH_CALENDAR},0)
CONFIGURE_FLAGS+= --enable-calendar
endif

ifneq (${WITH_CTYPE},0)
CONFIGURE_FLAGS+= --enable-ctype
endif

ifneq (${WITH_EXIF},0)
CONFIGURE_FLAGS+= --enable-exif
endif

ifneq (${WITH_FILTER},0)
CONFIGURE_FLAGS+= --enable-filter
endif

ifneq (${WITH_SESSION},0)
CONFIGURE_FLAGS+= --enable-session
endif

ifneq (${WITH_TOKENIZER},0)
CONFIGURE_FLAGS+= --enable-tokenizer
endif

ifeq (${WITH_ONIGURUMA},0)
CONFIGURE_FLAGS+= --disable-mbregex
endif

ifeq (${WITH_ONIGURUMA},shared)
# PHP_CONFIGURE_DEPS+= lib/lib/libonig.so
# CONFIGURE_FLAGS+= --with-onig=/src/lib
endif

DEPENDENCIES+= ${ENV_FILE} ${ARCHIVES}

third_party/php${PHP_VERSION}-src/configured: ${ENV_FILE} ${ARCHIVES} ${PHP_CONFIGURE_DEPS} third_party/php${PHP_VERSION}-src/patched third_party/php${PHP_VERSION}-src/ext/pib/pib.c
	@ echo -e "\e[33;4mConfiguring PHP\e[0m"
	${DOCKER_RUN_IN_PHP} which autoconf
	${DOCKER_RUN_IN_PHP} emconfigure ./buildconf --force
	${DOCKER_RUN_IN_PHP} emconfigure ./configure --cache-file=/src/.cache/config-cache \
		PKG_CONFIG_PATH=${PKG_CONFIG_PATH} \
		EXTENSION_DIR='./'  \
		--prefix='/src/lib/php${PHP_VERSION}' \
		--with-config-file-path=/php.ini \
		--with-config-file-scan-dir='/config:/preload' \
		--with-layout=GNU  \
		--with-valgrind=no \
		--enable-cgi       \
		--enable-phpdbg    \
		--enable-cli       \
		--enable-embed=static \
		--enable-pib       \
		--enable-json      \
		--enable-pdo       \
		--disable-all      \
		--disable-fiber-asm \
		--disable-rpath    \
		--without-pear     \
		--without-pcre-jit \
		${CONFIGURE_FLAGS}
	${DOCKER_RUN_IN_PHP} touch /src/third_party/php${PHP_VERSION}-src/configured

SYMBOL_FLAGS=
ifdef SYMBOLS
ifneq (${SYMBOLS},0)
SYMBOL_FLAGS=-g${SYMBOLS}
EXTRA_FLAGS+=${SYMBOL_FLAGS} -fno-inline
endif
endif

ifdef INLINING_LIMIT
EXTRA_FLAGS+= -sINLINING_LIMIT${INLINING_LIMIT}
endif

ifdef SOURCE_MAP_BASE
EXTRA_FLAGS+= --source-map-base ${SOURCE_MAP_BASE}
endif

ifneq (${PRE_JS_FILES},)
EXTRA_FLAGS+= --pre-js /src/.cache/pre.js
endif

.cache/pre.js: ${PRE_JS_FILES}
ifneq (${PRE_JS_FILES},)
	${DOCKER_RUN} cat $(addprefix /src/,${PRE_JS_FILES}) > .cache/pre.js
endif

WEB_FS_TYPE?=-lidbfs.js
NODE_FS_TYPE?=-lnodefs.js
WORKER_FS_TYPE?=${WEB_FS_TYPE}

ifneq (${NODE_RAW_FS},0)
NODE_FS_TYPE+= -lnoderawfs.js
endif

PRELOAD_METHOD=--preload-file

SAPI_CLI_PATH=sapi/cli/php-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
SAPI_CGI_PATH=sapi/cgi/php-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
SAPI_PHPDBG_PATH=sapi/phpdbg/php-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}

MAIN_MODULE?=1
ASYNCIFY?=1

BUILD_FLAGS=-f ../../php.mk \
	-j${CPU_COUNT} --max-load ${CPU_COUNT} \
	SKIP_LIBS='${SKIP_LIBS}' \
	ZEND_EXTRA_LIBS='${ZEND_EXTRA_LIBS}' \
	SAPI_CGI_PATH='${SAPI_CGI_PATH}' \
	SAPI_CLI_PATH='${SAPI_CLI_PATH}'\
	BUILD_BINARY='${SAPI_PHPDBG_PATH}'\
	PHP_CLI_OBJS='sapi/embed/php_embed.lo' \
	EXTRA_CFLAGS=' -Wno-int-conversion -Wimplicit-function-declaration -flto -fPIC ${EXTRA_CFLAGS} ${SYMBOL_FLAGS} '\
	EXTRA_CXXFLAGS=' -Wno-int-conversion -Wimplicit-function-declaration -flto -fPIC  ${EXTRA_CFLAGS} ${SYMBOL_FLAGS} '\
	EXTRA_LDFLAGS_PROGRAM='-O${OPTIMIZE} -static \
		-Wl,-zcommon-page-size=2097152 -Wl,-zmax-page-size=2097152 -L/src/lib/lib \
		${SYMBOL_FLAGS} -flto -fPIC \
		-s EXPORTED_FUNCTIONS='\''["_malloc", "_free", "_main"]'\'' \
		-s EXPORTED_RUNTIME_METHODS='\''["ccall", "UTF8ToString", "lengthBytesUTF8", "stringToUTF8", "getValue", "setValue", "lengthBytesUTF8", "FS", "ENV"]'\'' \
		-s INITIAL_MEMORY=${INITIAL_MEMORY} \
		-s MAXIMUM_MEMORY=${MAXIMUM_MEMORY} \
		-s ENVIRONMENT=${ENVIRONMENT}       \
		-s ERROR_ON_UNDEFINED_SYMBOLS=0     \
		-s ALLOW_MEMORY_GROWTH=1            \
		-s TOTAL_STACK=32MB                 \
		-s ASSERTIONS=${ASSERTIONS}         \
		-s EXPORT_NAME="'PHP'"              \
		-s FORCE_FILESYSTEM                 \
		-s EXIT_RUNTIME=1                   \
		-s INVOKE_RUN=0                     \
		-s MAIN_MODULE=${MAIN_MODULE}       \
		-s MODULARIZE=1                     \
		-s AUTO_NATIVE_LIBRARIES=0          \
		-s AUTO_JS_LIBRARIES=0              \
		-s ASYNCIFY=${ASYNCIFY}             \
		-I /src/third_party/php${PHP_VERSION}-src/ \
		-I /src/third_party/php${PHP_VERSION}-src/Zend \
		-I /src/third_party/php${PHP_VERSION}-src/main \
		-I /src/third_party/php${PHP_VERSION}-src/sapi/ \
		-I /src/third_party/php${PHP_VERSION}-src/ext/ \
		-I /src/lib/include \
		$(addprefix /src/,${ARCHIVES}) \
		${FS_TYPE} \
		${EXTRA_FILES} \
		${EXTRA_FLAGS} \
	'
BUILD_TYPE ?=js

ifneq (${PRE_JS_FILES},)
DEPENDENCIES+= .cache/pre.js
endif

WEB_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpWeb.mjs OutputBuffer.mjs fsOps.mjs webTransactions.mjs resolveDependencies.mjs _Event.mjs php-web.mjs)
WEB_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpWeb.js  OutputBuffer.js  fsOps.js  webTransactions.js  resolveDependencies.js  _Event.js php-web.js)
WORKER_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpWorker.mjs OutputBuffer.mjs fsOps.mjs webTransactions.mjs resolveDependencies.mjs _Event.mjs php-worker.mjs)
WORKER_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpWorker.js  OutputBuffer.js  fsOps.js  webTransactions.js  resolveDependencies.js  _Event.js php-worker.js)
WEBVIEW_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpWebview.mjs OutputBuffer.mjs fsOps.mjs webTransactions.mjs resolveDependencies.mjs _Event.mjs php-webview.mjs)
WEBVIEW_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpWebview.js  OutputBuffer.js  fsOps.js  webTransactions.js  resolveDependencies.js  _Event.js php-webview.js)
NODE_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpNode.mjs OutputBuffer.mjs fsOps.mjs resolveDependencies.mjs _Event.mjs php-node.mjs)
NODE_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpNode.js  OutputBuffer.js  fsOps.js  resolveDependencies.js  _Event.js php-node.js)

EXTRA_MODULES=${PHP_DIST_DIR}/php-tags.mjs ${PHP_DIST_DIR}/php-tags.jsdelivr.mjs ${PHP_DIST_DIR}/php-tags.local.mjs ${PHP_DIST_DIR}/php-tags.unpkg.mjs

WEB_MJS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.mjs ${EXTRA_MODULES}
WEB_JS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.mjs
WORKER_MJS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.mjs ${EXTRA_MODULES}
WORKER_JS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.mjs
WEBVIEW_MJS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.mjs ${EXTRA_MODULES}
WEBVIEW_JS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.js
NODE_MJS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.mjs ${EXTRA_MODULES}
NODE_JS+= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DIST_DIR}/config.js

ifneq (${PRELOAD_ASSETS},)
WEB_MJS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WEB_JS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_MJS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_JS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_MJS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_JS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_MJS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_JS+= ${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
endif

ifeq (${WITH_SOURCEMAPS},1)
WEB_MJS+= ${PHP_DIST_DIR}/php-web.mjs.wasm.map.MAPPED
WEB_JS+= ${PHP_DIST_DIR}/php-web.js.wasm.map.MAPPED
WORKER_MJS+= ${PHP_DIST_DIR}/php-worker.mjs.wasm.map.MAPPED
WORKER_JS+= ${PHP_DIST_DIR}/php-worker.mjs.wasm.map.MAPPED
WEBVIEW_MJS+= ${PHP_DIST_DIR}/php-webview.mjs.wasm.map.MAPPED
WEBVIEW_JS+= ${PHP_DIST_DIR}/php-webview.js.wasm.map.MAPPED
NODE_MJS+= ${PHP_DIST_DIR}/php-node.mjs.wasm.map.MAPPED
NODE_JS+= ${PHP_DIST_DIR}/php-node.js.wasm.map.MAPPED
endif

TAG_JS=$(addprefix ${PHP_DIST_DIR}/,php-tags.mjs php-tags.jsdelivr.mjs php-tags.unpkg.mjs php-tags.local.mjs)
ALL=${MJS} ${CJS} ${TAG_JS}

tags: ${TAG_JS}

web-mjs: ${WEB_MJS}
web-js: ${WEB_JS}
worker-mjs: ${WORKER_MJS}
worker-js: ${WORKER_JS}
webview-mjs: ${WEBVIEW_MJS}
webview-js: ${WEBVIEW_JS}
node-mjs: ${NODE_MJS}
node-js: ${NODE_JS}

_all: tags
	$(MAKE) web-mjs
	$(MAKE) worker-mjs
	$(MAKE) webview-mjs
	$(MAKE) node-mjs
	$(MAKE) web-js
	$(MAKE) worker-js
	$(MAKE) webview-js
	$(MAKE) node-js

mjs: tags
	$(MAKE) web-mjs
	$(MAKE) worker-mjs
	$(MAKE) webview-mjs
	$(MAKE) node-mjs

cjs: tags
	$(MAKE) web-js
	$(MAKE) worker-js
	$(MAKE) webview-js
	$(MAKE) node-js

NOTPARALLEL+=\
	web-mjs \
	web-js \
	worker-mjs \
	worker-js \
	webview-mjs \
	webview-js \
	node-mjs \
	node-js

DEPENDENCIES+= third_party/php${PHP_VERSION}-src/configured ${PHP_CONFIGURE_DEPS} ${PRE_JS_FILES}
EXTENSIONS_JS=Object.fromEntries(Object.entries({"WITH_BCMATH":"${WITH_BCMATH}","WITH_CALENDAR":"${WITH_CALENDAR}","WITH_CTYPE":"${WITH_CTYPE}","WITH_FILTER":"${WITH_FILTER}","WITH_TOKENIZER":"${WITH_TOKENIZER}","WITH_VRZNO":"${WITH_VRZNO}","WITH_EXIF":"${WITH_EXIF}","WITH_PHAR":"${WITH_PHAR}","WITH_LIBXML":"${WITH_LIBXML}","WITH_DOM":"${WITH_DOM}","WITH_XML":"${WITH_XML}","WITH_SIMPLEXML":"${WITH_SIMPLEXML}","WITH_LIBZIP":"${WITH_LIBZIP}","WITH_ICONV":"${WITH_ICONV}","WITH_SQLITE":"${WITH_SQLITE}","WITH_GD":"${WITH_GD}","WITH_ZLIB":"${WITH_ZLIB}","WITH_LIBPNG":"${WITH_LIBPNG}","WITH_FREETYPE":"${WITH_FREETYPE}","WITH_LIBJPEG":"${WITH_LIBJPEG}","WITH_YAML":"${WITH_YAML}","WITH_TIDY":"${WITH_TIDY}","WITH_MBSTRING":"${WITH_MBSTRING}","WITH_ONIGURUMA":"${WITH_ONIGURUMA}","WITH_OPENSSL":"${WITH_OPENSSL}","WITH_INTL":"${WITH_INTL}"}).filter(([k,v]) => v !== "0"))

${ENV_DIR}/${PHP_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/${PRELOAD_NAME}.data ${PHP_ASSET_DIR}
	- cp -Lprf ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data ${ENV_DIR}/${PHP_ASSET_DIR}/

${PHP_DIST_DIR}/config.mjs: .env
	echo '' > $@
	echo 'export const phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'export const phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_DIST_DIR}/config.js: .env
	echo 'module.exports = {};' > $@
	echo 'module.exports.phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'module.exports.phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_DIST_DIR}/php-web.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php-web.js: ENVIRONMENT=web
${PHP_DIST_DIR}/php-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php-web.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-web.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php-web.mjs: ENVIRONMENT=web
${PHP_DIST_DIR}/php-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php-web.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|_setTempRet0|setTempRet0|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-worker.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php-worker.js: ENVIRONMENT=worker
${PHP_DIST_DIR}/php-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DIST_DIR}/php-worker.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-worker.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php-worker.mjs: ENVIRONMENT=worker
${PHP_DIST_DIR}/php-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DIST_DIR}/php-worker.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-node.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php-node.js: ENVIRONMENT=node
${PHP_DIST_DIR}/php-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_DIST_DIR}/php-node.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-node.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php-node.mjs: ENVIRONMENT=node
${PHP_DIST_DIR}/php-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_DIST_DIR}/php-node.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-webview.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php-webview.js: ENVIRONMENT=webview
${PHP_DIST_DIR}/php-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php-webview.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

${PHP_DIST_DIR}/php-webview.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php-webview.mjs: ENVIRONMENT=webview
${PHP_DIST_DIR}/php-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php-webview.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
	${DOCKER_RUN_IN_PHP} emmake make -j1 cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php-${ENVIRONMENT}${PHP_SUFFIX}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}/
	@ cat ico.ans >&2

########## Package files ###########

${PHP_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_DIST_DIR}
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|' ${PHP_DIST_DIR}/$(notdir $@)
	perl -pi -w -e 's|require\("(\..+?)"\)|require("\1.js")|' ${PHP_DIST_DIR}/$(notdir $@)

${PHP_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -w -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_DIST_DIR}/php-tags.mjs: source/php-tags.mjs
	cp $< $@;

${PHP_DIST_DIR}/php-tags.jsdelivr.mjs: source/php-tags.jsdelivr.mjs
	cp $< $@;

${PHP_DIST_DIR}/php-tags.unpkg.mjs: source/php-tags.unpkg.mjs
	cp $< $@;

${PHP_DIST_DIR}/php-tags.local.mjs: source/php-tags.local.mjs
	cp $< $@;

########### Clerical stuff. ###########

${ENV_FILE}:
	touch ${ENV_FILE}

archives: ${ARCHIVES}

shared: ${SHARED_LIBS}

assets: $(foreach P,$(sort ${SHARED_ASSET_PATHS}),$(addprefix ${P}/,${PHP_ASSET_LIST}))
#	 @ echo $(foreach P,$(sort ${SHARED_ASSET_PATHS}),$(addprefix ${P}/,${PHP_ASSET_LIST}))

deps:
	${MAKE} -j${CPU_COUNT} ${ARCHIVES} ${PHP_CONFIGURE_DEPS}

PHPIZE: ${PHPIZE}

${PHPIZE}: third_party/php${PHP_VERSION}-src/scripts/phpize-built

third_party/php${PHP_VERSION}-src/scripts/phpize-built: ENVIRONMENT=web
third_party/php${PHP_VERSION}-src/scripts/phpize-built: ${DEPENDENCIES} | ${ORDER_ONLY}
	# ${DOCKER_RUN_IN_PHP} emmake make scripts/phpize ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} emmake make install-build  ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} chmod +x scripts/phpize
	${DOCKER_RUN_IN_PHP} touch scripts/phpize-built

patch/php8.4.patch:
	bash -c 'cd third_party/php8.4-src/ && git diff > ../../patch/php8.4.patch'
	perl -pi -w -e 's|([ab])/|\1/third_party/php8.4-src/|g' ./patch/php8.4.patch

patch/php8.3.patch:
	bash -c 'cd third_party/php8.3-src/ && git diff > ../../patch/php8.3.patch'
	perl -pi -w -e 's|([ab])/|\1/third_party/php8.3-src/|g' ./patch/php8.3.patch

patch/php8.2.patch:
	bash -c 'cd third_party/php8.2-src/ && git diff > ../../patch/php8.2.patch'
	perl -pi -w -e 's|([ab])/|\1/third_party/php8.2-src/|g' ./patch/php8.2.patch

patch/php8.1.patch:
	bash -c 'cd third_party/php8.1-src/ && git diff > ../../patch/php8.1.patch'
	perl -pi -w -e 's|([ab])/|\1/third_party/php8.1-src/|g' ./patch/php8.1.patch

patch/php8.0.patch:
	bash -c 'cd third_party/php8.0-src/ && git diff > ../../patch/php8.0.patch'
	perl -pi -w -e 's|([ab])/|\1/third_party/php8.0-src/|g' ./patch/php8.0.patch

# patch/libicu.patch:
# 	bash -c 'cd third_party/libicu-72-1 && git diff > ../../patch/libicu.patch'
# 	perl -pi -w -e 's|([ab])/|\1/third_party/libicu-72-1/|g' ./patch/libicu.patch

php-clean:
	${DOCKER_RUN_IN_PHP} rm -f configured
	${DOCKER_RUN_IN_PHP} bash -c 'rm -f \
		sapi/cli/php-*.js \
		sapi/cli/php-*.mjs \
		sapi/cli/php-*.wasm* \
		sapi/cgi/php-*.js \
		sapi/cgi/php-*.mjs \
		sapi/cgi/php-*.wasm* \
		sapi/phpdbg/php-*.js \
		sapi/phpdbg/php-*.mjs \
		sapi/phpdbg/php-*.wasm* \
		sapi/cli/php \
		sapi/cgi/php-cgi'
	${DOCKER_RUN} bash -c 'rm -f \
		packages/php-wasm/php-*.mjs \
		packages/php-cgi-wasm/php-*.mjs \
		packages/php-wasm/php-*.wasm \
		packages/php-cgi-wasm/php-*.wasm \
		packages/php-wasm/Php*.mjs \
		packages/php-cgi-wasm/Php*.mjs'
	- ${DOCKER_RUN_IN_PHP} make clean

clean:
	${DOCKER_RUN} rm -rf \
		.cache/config-cache \
		packages/php-wasm/*.js \
		packages/php-wasm/*.mjs \
		packages/php-wasm/*.map \
		packages/php-wasm/mapped \
		packages/php-cgi-wasm/*.js \
		packages/php-cgi-wasm/*.mjs \
		packages/php-cgi-wasm/*.map \
		packages/php-cgi-wasm/mapped \
		packages/php-dbg-wasm/*.js \
		packages/php-dbg-wasm/*.mjs \
		packages/php-dbg-wasm/*.map \
		packages/php-dbg-wasm/mapped \
		packages/*/*.so \
		packages/*/*.dat \
		packages/*/*.wasm \
		lib/* \
		demo-source/public/*.so \
		demo-source/public/*.wasm \
		demo-source/public/*.data \
		demo-source/public/*.map \
		packages/php-wasm/*.data \
		packages/php-wasm/*.mjs* \
		packages/php-cgi-wasm/*.data \
		packages/php-cgi-wasm/*.mjs* \
		third_party/php${PHP_VERSION}-src/configured \
		third_party/preload \
		.cache/pre.js \
		.cache/preload-collected
	${MAKE} php-clean

deep-clean: clean
	${DOCKER_RUN} rm -rf \
		packages/*/*.so \
		third_party/* \

show-ports:
	${DOCKER_RUN} emcc --show-ports

show-version:
	${DOCKER_RUN} emcc --show-version

show-files:
	${DOCKER_RUN} emcc --show-files

hooks:
	git config core.hooksPath githooks

image:
	${DOCKER_COMPOSE} build --progress plain

pull-image:
	${DOCKER_COMPOSE} --progress quiet pull

push-image:
	${DOCKER_COMPOSE} --progress quiet push

save-image:
	mkdir -p ./image
	docker image save seanmorris/php-emscripten-builder -o ./image/builder.tar

NPM_PUBLISH_DRY?=--dry-run

publish:
	npm publish ${NPM_PUBLISH_DRY}

test:
	${DOCKER_RUN} echo "Works!"
	${MAKE} node-mjs
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_ICONV} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_INTL=${WITH_INTL} node --test ${TEST_LIST} `ls test/*.mjs`

run:
	${DOCKER_ENV} emscripten-builder bash

all-versions:
	${MAKE} PHP_VERSION=8.0 all cgi-all
	${MAKE} PHP_VERSION=8.1 all cgi-all
	${MAKE} PHP_VERSION=8.2 all cgi-all
	${MAKE} PHP_VERSION=8.3 all cgi-all
	${MAKE} PHP_VERSION=8.4 all cgi-all

remap:
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-web.mjs.wasm.map packages/php-dbg-wasm

reconfigure:
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/configure

rebuild:
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/configured

.NOTPARALLEL: ${NOTPARALLEL}
