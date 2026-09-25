#!/usr/bin/env make
.DEFAULT_GOAL := all
.PHONY: all web js cjs mjs \
	web-mjs web-js \
	worker-mjs worker-js node-mjs \
	webnode-js webview-mjs webview-js \
	clean php-clean deep-clean show-ports show-versions show-files \
	hooks image push-image pull-image \
	dist demo serve-demo scripts run \
	test test-node test-node-standard test-node-cjs test-node-cjs-standard \
	test-deno test-bun test-bun-standard test-bun-cjs test-bun-cjs-standard test-browser \
	test-cgi-node test-cgi-node-cjs test-cgi-bun test-cgi-bun-cjs \
	all-versions all-versions all-stdlibs \
	test-all-versions x-all-versions php-clean-all-versions \
	demo-versions null \
	archives assets rebuild reconfigure \
	dynamic dynamic-libs.json runtime-wrappers

CLOUDFLARE_GOALS := cloudflare-mjs test-cloudflare
SDL_GOALS := sdl-mjs test-sdl-package
ifneq ($(filter ${SDL_GOALS},${MAKECMDGOALS}),)
ifneq ($(filter-out ${SDL_GOALS},${MAKECMDGOALS}),)
$(error SDL package targets must run separately from other build targets)
endif
ENV_FILE ?= profiles/sdl.mak
endif
ifneq ($(filter ${CLOUDFLARE_GOALS},${MAKECMDGOALS}),)
ifneq ($(filter-out ${CLOUDFLARE_GOALS},${MAKECMDGOALS}),)
$(error Cloudflare targets must run separately from other build targets)
endif
# A default configuration, just like the other builds' .env files.
ENV_FILE ?= profiles/cloudflare.mak
endif
MAKEFLAGS += --no-builtin-rules --no-builtin-variables --warn-undefined-variables

## Defaults:

ENV_DIR?=.
ENV_FILE?=.env
make_empty :=
make_space := ${make_empty} ${make_empty}
make_path = $(subst ${make_space},\${make_space},$(1))
shell_quote = '$(subst ','"'"',$(1))'
make_command_variables = $(foreach name,${.VARIABLES},$(if $(filter command line,$(origin ${name})),${name}))
make_overrides = $(foreach name,$(filter-out $(1),${make_command_variables}),$(call shell_quote,${name}=$(${name})))
-include $(call make_path,${ENV_FILE})
LIB_TYPE ?=$(shell basename '${ENV_FILE}' | sed -n 's/^\.env_[0-9][0-9.]*\.\([^.]*\)\.ci$$/\1/p')

## PHP Version
PHP_VERSION_DEFAULT=8.4
PHP_VERSION?=${PHP_VERSION_DEFAULT}
PHP_VARIANT?=

-include $(call make_path,${ENV_FILE}.${PHP_VERSION})
MAKE_SHUFFLE ?= --shuffle=random
MAKEFLAGS += ${MAKE_SHUFFLE}

CLOUDFLARE_OUTPUT_DIR ?= ${ENV_DIR}/packages/php-cloud-wasm
SDL_OUTPUT_DIR ?= ${ENV_DIR}/packages/php-sdl-wasm
SDL_RAW_DIR ?= .cache/sdl-raw/php${PHP_VERSION}
.PHONY: test-sdl-package
test-sdl-package: $(filter sdl-mjs,${MAKECMDGOALS})
	node bin/package-sdl.mjs --verify $(call shell_quote,${SDL_OUTPUT_DIR}) '${PHP_VERSION}'
.PHONY: test-cloudflare
# Artifact tests use the caller's package and installed test dependencies. When
# requested together, finish the native build before running them in this tree.
test-cloudflare: $(filter cloudflare-mjs,${MAKECMDGOALS})
	CLOUDFLARE_ARTIFACT_ROOT=$(call shell_quote,$(or ${CLOUDFLARE_ARTIFACT_ROOT},${CLOUDFLARE_OUTPUT_DIR})) PHP_VERSION='${PHP_VERSION}' node --test test/cloudflare/*.test.mjs

# Optional source workspaces use these same recipes and ordinary Docker Compose.
# Keep this dispatch before evaluating rules for any native build state.
BUILD_WORKSPACE ?=
ifneq ($(strip ${BUILD_WORKSPACE}),)
include build-workspace.mak
else

## Default libraries
WITH_BCMATH  ?=1
WITH_CALENDAR?=1
WITH_CTYPE   ?=1
WITH_EXIF    ?=1
WITH_FILTER  ?=1
WITH_SESSION ?=1
WITH_TOKENIZER?=1

SKIP_SHARED_LIBS?=0
PRELOAD_ASSETS?=

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

WITH_LIBXML?=dynamic

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

ifeq ($(filter ${PHP_VERSION},8.5 8.4 8.3 8.2 8.1 8.0),)
$(error PHP_VERSION MUST BE 8.5, 8.4, 8.3, 8.2, 8.1 or 8.0. (got ${PHP_VERSION}) PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

EXTRA_MODULES=
DYNAMIC_LIBS_GROUPED=
STATIC_LIB_CONFIG=
SHARED_LIB_CONFIG=
# Configure's link probes load the same side modules as the final PHP runtime.
# They must provide the Asyncify globals required by those libraries too.
PHP_CONFIGURE_VARS=LDFLAGS='-sASYNCIFY=${ASYNCIFY}'

## More Options
builder_resolve_path = $(if $(strip $(1)),$(if $(filter /% ~%,$(1)),$(1),$(abspath ${PHP_BUILDER_DIR}/$(1))))

ifdef PHP_BUILDER_DIR
ENV_DIR:=${PHP_BUILDER_DIR}
endif
PHP_DIST_DIR?=${ENV_DIR}/packages/php-wasm
INITIAL_MEMORY ?=128MB
MAXIMUM_MEMORY ?=4096MB
ASSERTIONS     ?=0
SYMBOLS        ?=0
OPTIMIZE       ?=3
SUB_OPTIMIZE   ?=${OPTIMIZE}
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

DOCKER_COMPOSE?=docker compose
CPU_COUNT?=`nproc || echo 1`
MAX_LOAD=$(shell echo $$(( `nproc` + $$(( `nproc` / 2 )) )))
LTO_FLAG?=-flto
# Keep native i64 signatures at every dynamic-linking boundary. Emscripten can
# otherwise choose a legalized web ABI while side modules retain native i64.
WASM_BIGINT_FLAG?=-sWASM_BIGINT=1
# Side modules can call PHP callbacks and imports which suspend (for example,
# libxml error handlers writing to an async database). Save those library frames
# too, including calls to imports whose implementation lives in the main module.
SIDE_MODULE_FLAGS?=-sSIDE_MODULE=1 ${WASM_BIGINT_FLAG} -sASYNCIFY=${ASYNCIFY} '-sASYNCIFY_IMPORTS=*'
DOCKER_ENV=PHP_DIST_DIR=$(abspath ${PHP_DIST_DIR}) ${DOCKER_COMPOSE} -p phpwasm run -T --rm -e PKG_CONFIG_PATH=${PKG_CONFIG_PATH} -e OUTER_UID=${UID}
DOCKER_RUN=${DOCKER_ENV} emscripten-builder
DOCKER_RUN_IN_PHP=${DOCKER_ENV} -e EMCC_FORCE_STDLIBS=libc++abi,libc++ -w /src/third_party/php${PHP_VERSION}-src/ emscripten-builder
MAKEFLAGS+= "-l${MAX_LOAD}"

WITH_CGI=1

PHP_CONFIGURE_DEPS=
PHP_LINK_DEPS=
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
PRE_JS_CACHE?=
PHPIZE=third_party/php${PHP_VERSION}-src/scripts/phpize

PRE_JS_FILES+= ${EXTRA_PRE_JS_FILES}

TEST_LIST?=

ifeq (${PHP_VERSION},8.5)
PHP_VERSION_FULL=8.5.2
PHP_BRANCH=php-${PHP_VERSION_FULL}
PHP_AR=libphp
endif

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

EXTRA_CFLAGS?=
ZEND_EXTRA_LIBS=
SKIP_LIBS=
PHP_ASSET_LIST=
PHP_ASSET_DIR?=${PHP_DIST_DIR}
PHP_STDLIB_DIR?=${PHP_DIST_DIR}/stdlib
SHARED_ASSET_PATHS=${PHP_ASSET_DIR}

ifdef PHP_BUILDER_DIR
PHP_DIST_DIR:=$(call builder_resolve_path,${PHP_DIST_DIR})
PHP_ASSET_DIR:=$(call builder_resolve_path,${PHP_ASSET_DIR})
PHP_STDLIB_DIR:=$(call builder_resolve_path,${PHP_STDLIB_DIR})
PRELOAD_ASSET_SOURCES=$(foreach asset,${PRELOAD_ASSETS},$(call builder_resolve_path,$(asset)))
else
PRELOAD_ASSET_SOURCES=${PRELOAD_ASSETS}
endif

PRELOAD_NAME=php
NOTPARALLEL=

all:
	$(MAKE) _all

EXTENSION_PACKAGE_DIRS ?= $(shell node bin/list-extension-packages.mjs)

-include packages/php-cgi-wasm/pre.mak
-include packages/php-cli-wasm/pre.mak
-include packages/php-dbg-wasm/pre.mak
-include $(addsuffix /pre.mak,${EXTENSION_PACKAGE_DIRS})

ifneq (${PRELOAD_ASSETS},)
# DEPENDENCIES+=
PHP_ASSET_LIST+= ${PRELOAD_NAME}.data
ORDER_ONLY+=.cache/preload-collected
EXTRA_FLAGS+= --preload-name ${PRELOAD_NAME} ${PRELOAD_METHOD} /src/third_party/preload@/preload
endif

MJS_HELPERS=OutputBuffer.mjs fsOps.mjs resolveDependencies.mjs _Event.mjs
CJS_HELPERS=OutputBuffer.js fsOps.js resolveDependencies.js _Event.js

MJS_HELPERS_WEB=${MJS_HELPERS} webTransactions.mjs idbfsSync.mjs
CJS_HELPERS_WEB=${CJS_HELPERS} webTransactions.js idbfsSync.js

PHP_SUFFIX?=${PHP_VERSION}${PHP_VARIANT}

-include $(addsuffix /static.mak,${EXTENSION_PACKAGE_DIRS})
-include packages/php-cgi-wasm/static.mak
-include packages/php-cli-wasm/static.mak
-include packages/php-dbg-wasm/static.mak

########### Collect & patch the source code. ###########

third_party/php${PHP_VERSION}-src/patched: third_party/php${PHP_VERSION}-src/.gitignore
	${DOCKER_RUN} git apply --no-index patch/php${PHP_VERSION}.patch
	${DOCKER_RUN} mkdir -p third_party/php${PHP_VERSION}-src/preload/Zend
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/patched

.cache/preload-collected: third_party/php${PHP_VERSION}-src/patched ${PRELOAD_ASSET_SOURCES} ${ENV_FILE}
	${DOCKER_RUN} rm -rf /src/third_party/preload
ifneq (${PRELOAD_ASSETS},)
	@ mkdir -p third_party/preload
	@ cp -prfL ${PRELOAD_ASSET_SOURCES} third_party/preload/
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

DEPENDENCIES+= ${ENV_FILE} ${ARCHIVES} ${PHP_LINK_DEPS}

PHP_CONFIGURE_ARGS = \
	PKG_CONFIG_PATH=${PKG_CONFIG_PATH} \
	${PHP_CONFIGURE_VARS} \
	EXTENSION_DIR='./' \
	--prefix='/src/lib/php${PHP_VERSION}' \
	--with-config-file-path=/php.ini \
	--with-config-file-scan-dir='/config:/preload' \
	--with-layout=GNU \
	--with-valgrind=no \
	--enable-cgi \
	--enable-phpdbg \
	--enable-cli \
	--enable-embed=static \
	--enable-pib \
	--enable-json \
	--enable-pdo \
	--disable-all \
	--disable-fiber-asm \
	--disable-rpath \
	--disable-opcache-jit \
	--without-pear \
	--without-pcre-jit \
	${CONFIGURE_FLAGS}

# Autoconf cache values are not portable across PHP versions or configurations.
# Track the selected arguments separately so command-line flag changes also
# invalidate configure, while a repeated identical invocation keeps its mtime.
PHP_CONFIGURE_CACHE_DIR = .cache/php-configure/php${PHP_VERSION_FULL}
PHP_CONFIGURE_CACHE_KEY = $(shell printf '%s\n' $(call shell_quote,${LIB_TYPE}) $(call shell_quote,${PHP_CONFIGURE_ARGS}) | sha256sum | cut -d' ' -f1)
PHP_CONFIGURE_CACHE = ${PHP_CONFIGURE_CACHE_DIR}/${PHP_CONFIGURE_CACHE_KEY}.cache
PHP_CONFIGURE_STAMP ?= .cache/php-configure-${PHP_VERSION}

.PHONY: php-configure-force
${PHP_CONFIGURE_STAMP}: php-configure-force
	@mkdir -p $(dir $@)
	@printf '%s\n' $(call shell_quote,${PHP_CONFIGURE_CACHE}) > $@.tmp
	@cmp -s $@.tmp $@ && rm $@.tmp || mv $@.tmp $@

third_party/php${PHP_VERSION}-src/configured: ${PHP_CONFIGURE_STAMP} ${ENV_FILE} ${ARCHIVES} ${PHP_CONFIGURE_DEPS} third_party/php${PHP_VERSION}-src/patched third_party/php${PHP_VERSION}-src/ext/pib/pib.c
	@ echo -e "\e[33;4mConfiguring PHP ${PHP_SUFFIX}\e[0m"
	${DOCKER_RUN_IN_PHP} which autoconf
	${DOCKER_RUN_IN_PHP} emconfigure ./buildconf --force
	${DOCKER_RUN} mkdir -p ${PHP_CONFIGURE_CACHE_DIR}
	${DOCKER_RUN_IN_PHP} emconfigure ./configure --cache-file=/src/${PHP_CONFIGURE_CACHE} ${PHP_CONFIGURE_ARGS}
	${DOCKER_RUN_IN_PHP} scripts/dev/credits
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
PRE_JS_CACHE:=.cache/pre.$(shell printf '%s\n' '${PRE_JS_FILES}' | sha1sum | cut -d' ' -f1).js
EXTRA_FLAGS+= --pre-js /src/${PRE_JS_CACHE}
endif

${PRE_JS_CACHE}: ${PRE_JS_FILES}
ifneq (${PRE_JS_FILES},)
	${DOCKER_RUN} cat $(addprefix /src/,${PRE_JS_FILES}) > ${PRE_JS_CACHE}
endif

WEB_FS_TYPE?=-lidbfs.js
NODE_FS_TYPE?=-lnodefs.js
WORKER_FS_TYPE?=${WEB_FS_TYPE}

ifneq (${NODE_RAW_FS},0)
NODE_FS_TYPE+= -lnoderawfs.js
endif

PRELOAD_METHOD=--preload-file

SAPI_CLI_PATH=sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
SAPI_CGI_PATH=sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
SAPI_PHPDBG_PATH=sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
PHP_CLI_OBJS=sapi/embed/php_embed.lo

MAIN_MODULE?=1
ASYNCIFY?=1

# PHP compilation cannot suspend, but Emscripten's conservative invoke_* call
# analysis otherwise instruments recursive Zend compiler helpers.  Those
# enlarged Wasm frames can exhaust WebKit's mixed JS/Wasm stack while loading
# large applications such as Drupal.  Keep this make-overridable so a toolchain
# experiment can replace or disable the list with ASYNCIFY_REMOVE= on the make
# command line.
ASYNCIFY_REMOVE?=zend_compile*,zend_add_literal*
ASYNCIFY_FLAGS=

ifneq (${ASYNCIFY},0)
ifneq (${ASYNCIFY_REMOVE},)
ASYNCIFY_FLAGS+=-s ASYNCIFY_REMOVE=${ASYNCIFY_REMOVE}
endif
endif

# Zend Fibers use Emscripten's native fiber API for PHP 8.1 and newer. The
# implementation switches stacks through Asyncify and cannot operate in a
# non-Asyncify main module.
ifneq ($(filter ${PHP_VERSION},8.5 8.4 8.3 8.2 8.1),)
ifeq (${ASYNCIFY},0)
$(error PHP ${PHP_VERSION} Zend Fibers require ASYNCIFY=1)
endif
endif

BUILD_FLAGS+=-f ../../php.mk \
	-j${CPU_COUNT} -l${MAX_LOAD} \
	SKIP_LIBS='${SKIP_LIBS}' \
	ZEND_EXTRA_LIBS='${ZEND_EXTRA_LIBS}' \
	SAPI_CGI_PATH='${SAPI_CGI_PATH}' \
	SAPI_CLI_PATH='${SAPI_CLI_PATH}'\
	BUILD_BINARY='${SAPI_PHPDBG_PATH}'\
	SAPI_PHPDBG_PATH='${SAPI_PHPDBG_PATH}'\
	PHP_CLI_OBJS='${PHP_CLI_OBJS}' \
	EXTRA_CFLAGS=' -Wno-int-conversion -Wimplicit-function-declaration ${LTO_FLAG} -fPIC ${EXTRA_CFLAGS} ${SYMBOL_FLAGS} -D HAVE_REALLOCARRAY=1 '\
	EXTRA_CXXFLAGS=' -Wno-int-conversion -Wimplicit-function-declaration ${LTO_FLAG} -fPIC  ${EXTRA_CFLAGS} ${SYMBOL_FLAGS} '\
	EXTRA_LDFLAGS_PROGRAM='-O${OPTIMIZE} -static \
		-Wl,-zcommon-page-size=2097152 -Wl,-zmax-page-size=2097152 -L/src/lib/lib \
		${SYMBOL_FLAGS} ${LTO_FLAG} -fPIC \
		-s EXPORTED_FUNCTIONS='\''["_malloc", "_free", "_main"]'\'' \
		-s EXPORTED_RUNTIME_METHODS='\''["ccall", "UTF8ToString", "lengthBytesUTF8", "stringToUTF8", "getValue", "setValue", "lengthBytesUTF8", "FS", "ENV", "HEAPU8"]'\'' \
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
		${WASM_BIGINT_FLAG}                 \
		-s MODULARIZE=1                     \
		-s AUTO_NATIVE_LIBRARIES=0          \
		-s AUTO_JS_LIBRARIES=0              \
		-s ASYNCIFY=${ASYNCIFY}             \
		${ASYNCIFY_FLAGS}                   \
		-I /src/third_party/php${PHP_VERSION}-src/ \
		-I /src/third_party/php${PHP_VERSION}-src/Zend \
		-I /src/third_party/php${PHP_VERSION}-src/main \
		-I /src/third_party/php${PHP_VERSION}-src/sapi/ \
		-I /src/third_party/php${PHP_VERSION}-src/ext/ \
		-I /src/lib/include \
		$(addprefix /src/,$(sort ${ARCHIVES})) \
		${FS_TYPE} \
		${EXTRA_FILES} \
		${EXTRA_FLAGS} \
	'
BUILD_TYPE ?=js

ifneq (${PRE_JS_FILES},)
DEPENDENCIES+= ${PRE_JS_CACHE}
endif

HELPER_MJS=${PHP_DIST_DIR}/php-tags.mjs ${PHP_DIST_DIR}/php-tags.jsdelivr.mjs ${PHP_DIST_DIR}/php-tags.local.mjs ${PHP_DIST_DIR}/php-tags.unpkg.mjs

WEB_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpWebBase.mjs PhpWeb.mjs php${PHP_SUFFIX}-web.mjs ${MJS_HELPERS_WEB})
WEB_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js PhpWebBase.js PhpWeb.js php${PHP_SUFFIX}-web.js ${CJS_HELPERS_WEB})
WORKER_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpWorker.mjs php${PHP_SUFFIX}-worker.mjs ${MJS_HELPERS_WEB})
WORKER_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpWorker.js php${PHP_SUFFIX}-worker.js ${CJS_HELPERS_WEB})
WEBVIEW_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpWebview.mjs php${PHP_SUFFIX}-webview.mjs ${MJS_HELPERS_WEB})
WEBVIEW_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpWebview.js php${PHP_SUFFIX}-webview.js ${CJS_HELPERS_WEB})
NODE_MJS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.mjs PhpNode.mjs php${PHP_SUFFIX}-node.mjs ${MJS_HELPERS})
NODE_JS=$(addprefix ${PHP_DIST_DIR}/,PhpBase.js  PhpNode.js php${PHP_SUFFIX}-node.js ${CJS_HELPERS})

WEB_MJS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
WEB_JS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}
WORKER_MJS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
WORKER_JS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}
WEBVIEW_MJS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
WEBVIEW_JS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}
NODE_MJS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
NODE_JS_ASSETS= $(addprefix ${PHP_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}

ifneq (${PRELOAD_ASSETS},)
WEB_MJS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WEB_JS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_MJS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_JS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_MJS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_JS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_MJS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_JS_ASSETS+= ${PHP_ASSET_DIR}/${PRELOAD_NAME}.data
endif

ifeq (${WITH_SOURCEMAPS},1)
WEB_MJS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs.wasm.map.MAPPED
WEB_JS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js.wasm.map.MAPPED
WORKER_MJS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs.wasm.map.MAPPED
WORKER_JS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs.wasm.map.MAPPED
WEBVIEW_MJS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs.wasm.map.MAPPED
WEBVIEW_JS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js.wasm.map.MAPPED
NODE_MJS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs.wasm.map.MAPPED
NODE_JS_ASSETS+= ${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js.wasm.map.MAPPED
endif

TAG_JS=$(addprefix ${PHP_DIST_DIR}/,php-tags.mjs php-tags.jsdelivr.mjs php-tags.unpkg.mjs php-tags.local.mjs)
ALL=${MJS} ${CJS} ${TAG_JS}

tags: ${TAG_JS}

############### StdLibs ###############

STDLIB_NODE_TARGET=
STDLIB_WEB_TARGET=
STDLIB_WORKER_TARGET=
STDLIB_WEBVIEW_TARGET=

# These modules instantiate the standard runtime and use its Node build as input.
ifeq (${PHP_VARIANT},)
ifneq ($(filter ${WITH_LIBXML},dynamic),)
ifneq ($(filter ${PHP_VERSION},8.5 8.4 8.3 8.2),)
STDLIB_NODE_TARGET=${PHP_STDLIB_DIR}/${PHP_VERSION}-node.mjs
STDLIB_WEB_TARGET=${PHP_STDLIB_DIR}/${PHP_VERSION}-web.mjs
STDLIB_WORKER_TARGET=${PHP_STDLIB_DIR}/${PHP_VERSION}-worker.mjs
STDLIB_WEBVIEW_TARGET=${PHP_STDLIB_DIR}/${PHP_VERSION}-webview.mjs
endif
endif
endif

stdlib: ${STDLIB_NODE_TARGET} ${STDLIB_WEB_TARGET} ${STDLIB_WORKER_TARGET} ${STDLIB_WEBVIEW_TARGET}

${PHP_STDLIB_DIR}/${PHP_VERSION}-node.mjs: ${PHP_DIST_DIR}/php${PHP_VERSION}-node.mjs ${PHP_DIST_DIR}/PhpNode.mjs
	mkdir -p $(dir $@)
	node demo-node/get-symbols.mjs ${PHP_VERSION} Node > $@

${PHP_STDLIB_DIR}/${PHP_VERSION}-web.mjs: ${PHP_DIST_DIR}/php${PHP_VERSION}-node.mjs ${PHP_DIST_DIR}/PhpNode.mjs
	mkdir -p $(dir $@)
	node demo-node/get-symbols.mjs ${PHP_VERSION} Web > $@

${PHP_STDLIB_DIR}/${PHP_VERSION}-worker.mjs: ${PHP_DIST_DIR}/php${PHP_VERSION}-node.mjs ${PHP_DIST_DIR}/PhpNode.mjs
	mkdir -p $(dir $@)
	node demo-node/get-symbols.mjs ${PHP_VERSION} Worker > $@

${PHP_STDLIB_DIR}/${PHP_VERSION}-webview.mjs: ${PHP_DIST_DIR}/php${PHP_VERSION}-node.mjs ${PHP_DIST_DIR}/PhpNode.mjs
	mkdir -p $(dir $@)
	node demo-node/get-symbols.mjs ${PHP_VERSION} Webview > $@

# Single Builds

.PHONY: sdl-mjs
sdl-mjs:
	mkdir -p $(call shell_quote,${SDL_RAW_DIR})
	$(MAKE) web-mjs $(call make_overrides,ENV_FILE PHP_DIST_DIR PHP_ASSET_DIR WITH_SDL) ENV_FILE=$(call shell_quote,${ENV_FILE}) WITH_SDL=1 PHP_DIST_DIR=$(call shell_quote,${SDL_RAW_DIR}) PHP_ASSET_DIR=$(call shell_quote,${SDL_RAW_DIR})
	node bin/package-sdl.mjs --build $(call shell_quote,${SDL_RAW_DIR}) '${PHP_VERSION}' $(call shell_quote,${SDL_OUTPUT_DIR})

.PHONY: cloudflare-mjs test-cloudflare
cloudflare-mjs:
	@test '${MAIN_MODULE}' = 0 || { echo 'Cloudflare requires MAIN_MODULE=0; select ENV_FILE=profiles/cloudflare.mak.' >&2; exit 1; }
	${DOCKER_RUN} emcc --version | head -1 | grep -E '(^|[[:space:]])6[.]0[.]6([[:space:]]|$$)'
	mkdir -p '${PHP_DIST_DIR}' .cache lib
	$(MAKE) ${PHP_CONFIGURE_DEPS} ${ARCHIVES} $(call make_overrides,) EXTENSION_PACKAGE_DIRS='${EXTENSION_PACKAGE_DIRS}'
	$(MAKE) '${PHP_DIST_DIR}/php${PHP_VERSION}-cloudflare-runtime.mjs' '${PHP_DIST_DIR}/php${PHP_VERSION}-cloudflare-runtime.mjs.wasm' $(call make_overrides,) EXTENSION_PACKAGE_DIRS='${EXTENSION_PACKAGE_DIRS}'
	INITIAL_MEMORY='${INITIAL_MEMORY}' MAXIMUM_MEMORY='${MAXIMUM_MEMORY}' node bin/package-cloudflare.mjs --build $(call shell_quote,${PHP_DIST_DIR}) '${PHP_VERSION}' $(call shell_quote,${CLOUDFLARE_OUTPUT_DIR})

CLOUDFLARE_RUNTIME = ${PHP_DIST_DIR}/php${PHP_VERSION}-cloudflare-runtime.mjs
${CLOUDFLARE_RUNTIME} ${CLOUDFLARE_RUNTIME}.wasm: BUILD_TYPE=mjs
${CLOUDFLARE_RUNTIME} ${CLOUDFLARE_RUNTIME}.wasm: ENVIRONMENT=worker
${CLOUDFLARE_RUNTIME} ${CLOUDFLARE_RUNTIME}.wasm: FS_TYPE=-lidbfs.js
${CLOUDFLARE_RUNTIME} ${CLOUDFLARE_RUNTIME}.wasm &: ${DEPENDENCIES} third_party/php${PHP_VERSION}-src/configured | ${ORDER_ONLY}
	${DOCKER_RUN_IN_PHP} emmake make cli ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS='' SAPI_CLI_PATH='sapi/cli/php${PHP_VERSION}-cloudflare-runtime.mjs'
	cp third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_VERSION}-cloudflare-runtime.mjs ${CLOUDFLARE_RUNTIME}
	cp third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_VERSION}-cloudflare-runtime.wasm ${CLOUDFLARE_RUNTIME}.wasm
	perl -pi -e 's/php${PHP_VERSION}-cloudflare-runtime\.wasm/php${PHP_VERSION}-cloudflare-runtime.mjs.wasm/g' ${CLOUDFLARE_RUNTIME}

web-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEB_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEB_MJS_ASSETS}
ifneq (${STDLIB_WEB_TARGET},)
	${MAKE} ${STDLIB_WEB_TARGET}
endif
	@ cat ico.ans >&2

web-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEB_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEB_JS_ASSETS}
	@ cat ico.ans >&2

worker-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WORKER_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WORKER_MJS_ASSETS}
ifneq (${STDLIB_WORKER_TARGET},)
	${MAKE} ${STDLIB_WORKER_TARGET}
endif
	@ cat ico.ans >&2

worker-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WORKER_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WORKER_JS_ASSETS}
	@ cat ico.ans >&2

webview-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEBVIEW_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEBVIEW_MJS_ASSETS}
ifneq (${STDLIB_WEBVIEW_TARGET},)
	${MAKE} ${STDLIB_WEBVIEW_TARGET}
endif
	@ cat ico.ans >&2

webview-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEBVIEW_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEBVIEW_JS_ASSETS}
	@ cat ico.ans >&2

node-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${NODE_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${NODE_MJS_ASSETS}
ifneq (${STDLIB_NODE_TARGET},)
	${MAKE} ${STDLIB_NODE_TARGET}
endif
	@ cat ico.ans >&2

node-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${NODE_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${NODE_JS_ASSETS}
	@ cat ico.ans >&2

# You must have one of the above "Single Builds" done to use the following step.
# Don't use it unless you're mad at your CPU cooler.
fast-build: third_party/php${PHP_VERSION}-src/main/main.o
	$(MAKE) -j${CPU_COUNT} -l${CPU_COUNT} \
		${WEB_MJS} ${WORKER_MJS} ${WEBVIEW_MJS} ${NODE_MJS} \
		${WEB_JS}  ${WORKER_JS}  ${WEBVIEW_JS}  ${NODE_JS} \
		${WEB_CGI_MJS} ${WORKER_CGI_MJS} ${WEBVIEW_CGI_MJS} ${NODE_CGI_MJS} \
		${WEB_CGI_JS}  ${WORKER_CGI_JS}  ${WEBVIEW_CGI_JS}  ${NODE_CGI_JS} \
		${WEB_DBG_MJS} ${WEB_DBG_JS}
	@ cat ico.ans >&2

_all: tags
	$(MAKE) web-mjs
	$(MAKE) worker-mjs
	$(MAKE) webview-mjs
	$(MAKE) node-mjs
	$(MAKE) web-js
	$(MAKE) worker-js
	$(MAKE) webview-js
	$(MAKE) node-js
	$(MAKE) cgi-all
	$(MAKE) cli-all
	$(MAKE) dbg-all

mjs: tags
	$(MAKE) web-mjs
	$(MAKE) worker-mjs
	$(MAKE) webview-mjs
	$(MAKE) node-mjs
	$(MAKE) cgi-mjs
	$(MAKE) cli-mjs
	$(MAKE) dbg-mjs

cjs: tags
	$(MAKE) web-js
	$(MAKE) worker-js
	$(MAKE) webview-js
	$(MAKE) node-js
	$(MAKE) cgi-js
	$(MAKE) cli-js
	$(MAKE) dbg-js

common-web:
	$(MAKE) web-mjs
	$(MAKE) worker-cgi-mjs
	$(MAKE) web-cli-mjs
	$(MAKE) web-dbg-mjs

common:
	$(MAKE) web-mjs
	$(MAKE) worker-cgi-mjs
	$(MAKE) web-cli-mjs
	$(MAKE) web-dbg-mjs
	$(MAKE) node-mjs

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

${PHP_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	cp -Lpf third_party/php${PHP_VERSION}-src/sapi/cli/${PRELOAD_NAME}.data $@

${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js: ENVIRONMENT=web
${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	node bin/transform-logical-assignments.mjs $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-web.js.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs: ENVIRONMENT=web
${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|REMOTE_PACKAGE_BASE="(.+?)"|REMOTE_PACKAGE_BASE=new URL("\1", import.meta.url).href|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-web.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-web.mjs.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.js: ENVIRONMENT=worker
${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	node bin/transform-logical-assignments.mjs $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.js.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-worker.js.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs: ENVIRONMENT=worker
${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|REMOTE_PACKAGE_BASE="(.+?)"|REMOTE_PACKAGE_BASE=new URL("\1", import.meta.url).href|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-worker.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-worker.mjs.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js: ENVIRONMENT=node
${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	node bin/transform-logical-assignments.mjs $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-node.js.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs: ENVIRONMENT=node
${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|from '\''module'\''|from '\''node:module'\''|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-node.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-node.mjs.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js: BUILD_TYPE=js
${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js: ENVIRONMENT=webview
${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	node bin/transform-logical-assignments.mjs $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-webview.js.wasm.map ${PHP_DIST_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs: BUILD_TYPE=mjs
${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs: ENVIRONMENT=webview
${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DIST_DIR}
	perl -pi -w -e 's|import\(name\)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require\("fs"\)|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|REMOTE_PACKAGE_BASE="(.+?)"|REMOTE_PACKAGE_BASE=new URL("\1", import.meta.url).href|g' $@
	- cp -Lprf ${PHP_DIST_DIR}/php${PHP_SUFFIX}-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_ASSET_DIR}

${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs.wasm.map.MAPPED: ${PHP_DIST_DIR}/php${PHP_SUFFIX}-webview.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/cli/php${PHP_SUFFIX}-webview.mjs.wasm.map ${PHP_DIST_DIR}

########## Package files ###########

# Every declared wrapper ships regardless of the selected native build profile.
# This target only copies/transpiles source wrappers; it never builds PHP/Wasm.
runtime_wrapper_mjs = $(patsubst %.d.mts,%.mjs,$(notdir $(wildcard packages/$(1)/Php*.d.mts)))
PHP_CLOUD_WRAPPER_DIR?=${ENV_DIR}/packages/php-cloud-wasm
PHP_SDL_WRAPPER_DIR?=${ENV_DIR}/packages/php-sdl-wasm
RUNTIME_WRAPPERS=$(addprefix ${PHP_DIST_DIR}/,$(call runtime_wrapper_mjs,php-wasm) ${MJS_HELPERS_WEB} $(notdir ${HELPER_MJS})) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,$(call runtime_wrapper_mjs,php-cgi-wasm) ${CGI_MJS_HELPERS_WEB} ${MJS_HELPERS_WEB}) \
	$(addprefix ${PHP_CLI_DIST_DIR}/,$(call runtime_wrapper_mjs,php-cli-wasm) ${MJS_HELPERS_WEB}) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,$(call runtime_wrapper_mjs,php-dbg-wasm) ${MJS_HELPERS_WEB})
RUNTIME_WRAPPERS_CJS=$(patsubst %.mjs,%.js,$(filter-out ${HELPER_MJS},${RUNTIME_WRAPPERS}))
CLOUD_WRAPPERS=$(addprefix ${PHP_CLOUD_WRAPPER_DIR}/,$(call runtime_wrapper_mjs,php-cloud-wasm) ${MJS_HELPERS})
SDL_WRAPPERS=$(addprefix ${PHP_SDL_WRAPPER_DIR}/,$(call runtime_wrapper_mjs,php-sdl-wasm) ${MJS_HELPERS_WEB})

runtime-wrappers:
	mkdir -p ${PHP_DIST_DIR} ${PHP_CGI_DIST_DIR} ${PHP_CLI_DIST_DIR} ${PHP_DBG_DIST_DIR} ${PHP_CLOUD_WRAPPER_DIR} ${PHP_SDL_WRAPPER_DIR}
	$(MAKE) ${RUNTIME_WRAPPERS} ${RUNTIME_WRAPPERS_CJS} ${CLOUD_WRAPPERS} ${SDL_WRAPPERS}

${SDL_WRAPPERS}: ${PHP_SDL_WRAPPER_DIR}/%.mjs: source/%.mjs
	cp $< $@

${CLOUD_WRAPPERS}: ${PHP_CLOUD_WRAPPER_DIR}/%.mjs: source/%.mjs
	cp $< $@

${PHP_DIST_DIR}/%.js: source/%.mjs
	npx babel $< --out-dir ${PHP_DIST_DIR}
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|g' ${PHP_DIST_DIR}/$(notdir $@)
	perl -pi -w -e 's|require\("(\..+?).mjs"\)|require("\1.js")|g' ${PHP_DIST_DIR}/$(notdir $@)

${PHP_DIST_DIR}/%.mjs: source/%.mjs
	cp $< $@;

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
	touch -a ${ENV_FILE}

archives:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${ARCHIVES}

shared:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${SHARED_LIBS}

assets: $(foreach P,$(sort ${SHARED_ASSET_PATHS}),$(addprefix ${P}/,${PHP_ASSET_LIST}))

deps:
	${MAKE} -j${CPU_COUNT} -l${MAX_LOAD} ${ARCHIVES} ${PHP_CONFIGURE_DEPS}

dynamic:
	${MAKE} -j${CPU_COUNT} -l${MAX_LOAD} ${DYNAMIC_LIBS}

dynamic-libs.json:
	echo ${DYNAMIC_LIBS_GROUPED} | jq -Rc 'split(" ")' > $@

PHPIZE: ${PHPIZE}

${PHPIZE}: third_party/php${PHP_VERSION}-src/scripts/phpize-built

third_party/php${PHP_VERSION}-src/scripts/phpize-built: ENVIRONMENT=web
third_party/php${PHP_VERSION}-src/scripts/phpize-built: ${DEPENDENCIES} | ${ORDER_ONLY}
	${DOCKER_RUN_IN_PHP} emmake make install-build  ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,$(sort ${SHARED_LIBS}))"
	${DOCKER_RUN_IN_PHP} chmod +x scripts/phpize
	${DOCKER_RUN_IN_PHP} touch scripts/phpize-built

patch/php8.5.patch:
	bash -c 'cd third_party/php8.5-src/ && git diff > ../../patch/php8.5.patch'
	perl -pi -w -e 's|([ab])/|\1/third_party/php8.5-src/|g' ./patch/php8.5.patch

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

php-clean:
	${DOCKER_RUN} rm -rf ${PHP_CONFIGURE_CACHE_DIR}
	${DOCKER_RUN} rm -f ${PHP_CONFIGURE_STAMP} .cache/sdl-config-${PHP_VERSION}
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
		packages/php-wasm/php${PHP_VERSION}-*.mjs \
		packages/php-cgi-wasm/php${PHP_VERSION}-*.mjs \
		packages/php-cli-wasm/php${PHP_VERSION}-*.mjs \
		packages/php-dbg-wasm/php${PHP_VERSION}-*.mjs \
		packages/php-wasm/php${PHP_VERSION}-*.wasm \
		packages/php-cgi-wasm/php${PHP_VERSION}-*.wasm \
		packages/php-cli-wasm/php${PHP_VERSION}-*.wasm \
		packages/php-dbg-wasm/php${PHP_VERSION}-*.wasm \
		packages/php-wasm/Php*.mjs \
		packages/php-cgi-wasm/Php*.mjs' \
		packages/php-cli-wasm/Php*.mjs' \
		packages/php-dbg-wasm/Php*.mjs'
	${DOCKER_RUN} rm -rf lib/include/lexbor
	${DOCKER_RUN} rm -rf third_party/php${PHP_VERSION}-src/ext/yaml
	${DOCKER_RUN} bash -c 'ls third_party/ | grep "php${PHP_VERSION}-.*" | while read DIR; do { \
		cd "third_party/$${DIR}"; \
		make clean; \
		cd ../..; \
	}; done;'
	- ${DOCKER_RUN_IN_PHP} make clean distclean

clean:
	${DOCKER_RUN} rm -rf \
		.cache/config-cache \
		.cache/php-configure \
		.cache/php-configure-* \
		.cache/sdl-config-* \
		packages/php-wasm/*.js \
		packages/php-wasm/*.mjs \
		packages/php-wasm/*.map \
		packages/php-wasm/mapped \
		packages/php-cgi-wasm/*.js \
		packages/php-cgi-wasm/*.mjs \
		packages/php-cgi-wasm/*.map \
		packages/php-cgi-wasm/mapped \
		packages/php-cli-wasm/*.js \
		packages/php-cli-wasm/*.mjs \
		packages/php-cli-wasm/*.map \
		packages/php-cli-wasm/mapped \
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
		packages/php-cli-wasm/*.data \
		packages/php-cli-wasm/*.mjs* \
		third_party/php${PHP_VERSION}-src/configured \
		third_party/preload \
		.cache/pre*.js \
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

NPM_PUBLISH_TAG?=latest
NPM_PUBLISH_DRY?=--dry-run

BUILDER_PACKAGE_OUTPUT?=${CURDIR}/.cache/release
.PHONY: package-builder
package-builder:
	node bin/package-builder.mjs $(call shell_quote,${BUILDER_PACKAGE_OUTPUT})

publish:
	./publish-packages.sh ${NPM_PUBLISH_TAG} ${NPM_PUBLISH_DRY}

test:
	${MAKE} test-node
ifneq ($(filter ${PHP_VERSION},8.5 8.4 8.3 8.2),)
	${MAKE} test-deno
endif
	${MAKE} test-bun

NODE_TEST_FLAGS=
BUN_TEST_FLAGS?=--timeout 300000
JS_TEST_RUNNER=node ${NODE_TEST_FLAGS} --test
test-bun test-bun-standard test-bun-cjs test-bun-cjs-standard test-cgi-bun test-cgi-bun-cjs: JS_TEST_RUNNER=bun test ${BUN_TEST_FLAGS}
CGI_TEST_RUNTIME=node
test-cgi-bun test-cgi-bun-cjs: CGI_TEST_RUNTIME=bun

DOC_TESTS=
DOC_TESTS_CJS=
PACKAGING_TESTS=test/packaging.test.mjs

ifdef SKIP_PACKAGING_TEST
ifeq (${SKIP_PACKAGING_TEST},1)
PACKAGING_TESTS=
endif
endif

ifeq (${LIB_TYPE},dynamic)
DOC_TESTS+=test/docs.test.mjs
DOC_TESTS+=test/docs-cgi.test.mjs
DOC_TESTS_CJS+=test/docs.test.cjs
endif

# Explicit paths also let Bun discover the canonical files without *.test.* names.
ESM_TEST_FILES=${TEST_LIST} ${DOC_TESTS} ${PACKAGING_TESTS} $(filter-out test/docs.test.mjs test/docs-cgi.test.mjs test/packaging.test.mjs,$(wildcard test/*.mjs))
CJS_TEST_FILES=${TEST_LIST} ${DOC_TESTS_CJS} $(filter-out test/docs.test.cjs test/docs-cgi.test.cjs,$(wildcard test/*.cjs))

test-node test-bun: node-mjs node-cgi-mjs
	PHP_VERSION=${PHP_VERSION} \
	PHP_VARIANT=${PHP_VARIANT} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} ${JS_TEST_RUNNER} $(addprefix ./,${ESM_TEST_FILES})

test-node-standard test-bun-standard: node-mjs node-cgi-mjs node-cli-mjs node-dbg-mjs
	PHP_VERSION=${PHP_VERSION} \
	PHP_VARIANT=${PHP_VARIANT} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} ${JS_TEST_RUNNER} $(addprefix ./,${ESM_TEST_FILES}) \
		./test/cli-node/cli-node.test.mjs \
		./test/dbg-node/dbg-node.test.mjs

test-node-cjs test-bun-cjs: node-js
	PHP_VERSION=${PHP_VERSION} \
	PHP_VARIANT=${PHP_VARIANT} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} ${JS_TEST_RUNNER} $(addprefix ./,${CJS_TEST_FILES})

test-node-cjs-standard test-bun-cjs-standard: node-js node-cli-js node-dbg-js
	PHP_VERSION=${PHP_VERSION} \
	PHP_VARIANT=${PHP_VARIANT} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} ${JS_TEST_RUNNER} $(addprefix ./,${CJS_TEST_FILES}) \
		./test/cli-node/cli-node.test.cjs \
		./test/dbg-node/dbg-node.test.cjs

test-deno: node-mjs node-cgi-mjs
	PHP_VERSION=${PHP_VERSION} \
	PHP_VARIANT=${PHP_VARIANT} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} deno test $(addprefix ./,${ESM_TEST_FILES}) --allow-read --allow-write --allow-env --allow-net --allow-sys --allow-run=npm,bash,node,make

test-browser:
	PHP_VERSION=${PHP_VERSION} PHP_VARIANT=${PHP_VARIANT} LIB_TYPE=${LIB_TYPE} test/browser-test.sh

DEMO_WEB_PHP_VERSION ?= 8.4

test-demo-web:
	PHP_VERSION=${DEMO_WEB_PHP_VERSION} LIB_TYPE=${LIB_TYPE} DEMO_WEB_ARTIFACT_ROOT=${DEMO_WEB_ARTIFACT_ROOT} test/demo-web-test.sh

test-cgi-node test-cgi-bun: node-mjs node-cgi-mjs
	PHP_VERSION=${PHP_VERSION} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} \
	CGI_TEST_RUNTIME=${CGI_TEST_RUNTIME} BUN_TEST_FLAGS='${BUN_TEST_FLAGS}' test/node-cgi-test.sh
ifeq (${LIB_TYPE},dynamic)
	PHP_VERSION=${PHP_VERSION} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} ${JS_TEST_RUNNER} ./test/docs-cgi.test.mjs
endif

test-cgi-node-cjs test-cgi-bun-cjs: node-js node-cgi-js
	PHP_VERSION=${PHP_VERSION} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} \
	CGI_TEST_RUNTIME=${CGI_TEST_RUNTIME} BUN_TEST_FLAGS='${BUN_TEST_FLAGS}' \
	TEST_FORMAT=cjs test/node-cgi-test.sh
ifeq (${LIB_TYPE},dynamic)
	PHP_VERSION=${PHP_VERSION} \
	LIB_TYPE=${LIB_TYPE} \
	WITH_LIBXML=${WITH_LIBXML} \
	WITH_LIBZIP=${WITH_LIBZIP} \
	WITH_ICONV=${WITH_ICONV} \
	WITH_SQLITE=${WITH_SQLITE} \
	WITH_GD=${WITH_GD} \
	WITH_PHAR=${WITH_PHAR} \
	WITH_ZLIB=${WITH_ZLIB} \
	WITH_LIBPNG=${WITH_LIBPNG} \
	WITH_FREETYPE=${WITH_FREETYPE} \
	WITH_LIBJPEG=${WITH_LIBJPEG} \
	WITH_DOM=${WITH_DOM} \
	WITH_SIMPLEXML=${WITH_SIMPLEXML} \
	WITH_XML=${WITH_XML} \
	WITH_XMLREADER=${WITH_XMLREADER} \
	WITH_XMLWRITER=${WITH_XMLWRITER} \
	WITH_YAML=${WITH_YAML} \
	WITH_TIDY=${WITH_TIDY} \
	WITH_MBSTRING=${WITH_MBSTRING} \
	WITH_ONIGURUMA=${WITH_ONIGURUMA} \
	WITH_OPENSSL=${WITH_OPENSSL} \
	WITH_SDL=${WITH_SDL} \
	WITH_INTL=${WITH_INTL} ${JS_TEST_RUNNER} ./test/docs-cgi.test.cjs
endif

update-snapshots:
	PHP_VERSION=${PHP_VERSION} PHP_VARIANT=${PHP_VARIANT} LIB_TYPE=${LIB_TYPE} UPDATE_SNAPSHOTS=1 test/browser-test.sh

run:
	${DOCKER_ENV} emscripten-builder bash

all-versions:
	${MAKE} PHP_VERSION=8.5
	${MAKE} PHP_VERSION=8.4
	${MAKE} PHP_VERSION=8.3
	${MAKE} PHP_VERSION=8.2
	${MAKE} PHP_VERSION=8.1
	${MAKE} PHP_VERSION=8.0

all-stdlibs:
	${MAKE} stdlib PHP_VERSION=8.5
	${MAKE} stdlib PHP_VERSION=8.4
	${MAKE} stdlib PHP_VERSION=8.3
	${MAKE} stdlib PHP_VERSION=8.2

test-all-versions:
	${MAKE} test PHP_VERSION=8.5
	${MAKE} test PHP_VERSION=8.4
	${MAKE} test PHP_VERSION=8.3
	${MAKE} test PHP_VERSION=8.2
	${MAKE} test PHP_VERSION=8.1
	${MAKE} test PHP_VERSION=8.0

x-all-versions:
	${MAKE} ${X} PHP_VERSION=8.5
	${MAKE} ${X} PHP_VERSION=8.4
	${MAKE} ${X} PHP_VERSION=8.3
	${MAKE} ${X} PHP_VERSION=8.2
	${MAKE} ${X} PHP_VERSION=8.1
	${MAKE} ${X} PHP_VERSION=8.0

php-clean-all-versions:
	${MAKE} php-clean PHP_VERSION=8.5
	${MAKE} php-clean PHP_VERSION=8.4
	${MAKE} php-clean PHP_VERSION=8.3
	${MAKE} php-clean PHP_VERSION=8.2
	${MAKE} php-clean PHP_VERSION=8.1
	${MAKE} php-clean PHP_VERSION=8.0

demo-versions:
	${MAKE} sdl-mjs ENV_FILE=$(call shell_quote,${ENV_FILE}) PHP_VERSION=8.5
	${MAKE} sdl-mjs ENV_FILE=$(call shell_quote,${ENV_FILE}) PHP_VERSION=8.4
	${MAKE} sdl-mjs ENV_FILE=$(call shell_quote,${ENV_FILE}) PHP_VERSION=8.3
	${MAKE} sdl-mjs ENV_FILE=$(call shell_quote,${ENV_FILE}) PHP_VERSION=8.2
	${MAKE} sdl-mjs ENV_FILE=$(call shell_quote,${ENV_FILE}) PHP_VERSION=8.1
	${MAKE} sdl-mjs ENV_FILE=$(call shell_quote,${ENV_FILE}) PHP_VERSION=8.0

	${MAKE} worker-cgi-mjs web-cli-mjs web-dbg-mjs PHP_VERSION=8.3 WITH_SDL=0

	${MAKE} web-mjs PHP_VERSION=8.5 WITH_SDL=0
	${MAKE} web-mjs PHP_VERSION=8.4 WITH_SDL=0
	${MAKE} web-mjs PHP_VERSION=8.3 WITH_SDL=0
	${MAKE} web-mjs PHP_VERSION=8.2 WITH_SDL=0
	${MAKE} web-mjs PHP_VERSION=8.1 WITH_SDL=0
	${MAKE} web-mjs PHP_VERSION=8.0 WITH_SDL=0


reconfigure:
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/configure

rebuild:
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/configured

demo: web-mjs worker-cgi-mjs web-dbg-mjs
	npm run build --prefix ./demo-web

serve-demo: web-mjs worker-cgi-mjs web-dbg-mjs
	npm run start --prefix ./demo-web

null:

endif # BUILD_WORKSPACE
