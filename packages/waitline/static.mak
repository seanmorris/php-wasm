#!/usr/bin/env make

WAITLINE_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
WAITLINE_SOURCE_STAMP?=third_party/waitline/.php-wasm-source.json
WAITLINE_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/waitline/.php-wasm-source.json
waitline_shell_quote = '$(subst ','"'"',$(1))'

.PHONY: waitline-import-check
waitline-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${WAITLINE_SOURCE_STAMP}: SHELL := /bin/bash
${WAITLINE_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${WAITLINE_SOURCE_STAMP}: waitline-import-check
ifdef WAITLINE_DEV_PATH
	@node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) snapshot $(call waitline_shell_quote,${WAITLINE_DEV_PATH}) $(call waitline_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) stage $(call waitline_shell_quote,${WAITLINE_REPOSITORY}) $(call waitline_shell_quote,${WAITLINE_REF})
endif

${WAITLINE_EXTENSION_STAMP}: ${WAITLINE_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore waitline-import-check
	@${DOCKER_RUN} node $(call waitline_shell_quote,${WAITLINE_IMPORTER}) sync $(call waitline_shell_quote,${PHP_VERSION})

# Compatibility targets only verify imported files; the builder owns writes.
third_party/waitline/waitline.c third_party/waitline/config.m4: ${WAITLINE_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/waitline/waitline.c third_party/php${PHP_VERSION}-src/ext/waitline/config.m4: ${WAITLINE_EXTENSION_STAMP}
	@test -f "$@"
