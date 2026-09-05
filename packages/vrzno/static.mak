#!/usr/bin/env make

VRZNO_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
VRZNO_SOURCE_STAMP?=third_party/vrzno/.php-wasm-source.json
VRZNO_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/vrzno/.php-wasm-source.json
vrzno_shell_quote = '$(subst ','"'"',$(1))'

.PHONY: vrzno-import-check
vrzno-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${VRZNO_SOURCE_STAMP}: SHELL := /bin/bash
${VRZNO_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${VRZNO_SOURCE_STAMP}: vrzno-import-check
ifdef VRZNO_DEV_PATH
	@node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) snapshot $(call vrzno_shell_quote,${VRZNO_DEV_PATH}) $(call vrzno_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) stage $(call vrzno_shell_quote,${VRZNO_REPOSITORY}) $(call vrzno_shell_quote,${VRZNO_REF})
endif

${VRZNO_EXTENSION_STAMP}: ${VRZNO_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore vrzno-import-check
	@${DOCKER_RUN} node $(call vrzno_shell_quote,${VRZNO_IMPORTER}) sync $(call vrzno_shell_quote,${PHP_VERSION})

# Compatibility targets verify imported files without touching Docker-owned
# files on the host, or creating an empty source file to satisfy Make.
third_party/vrzno/vrzno.c: ${VRZNO_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/vrzno/vrzno.c third_party/php${PHP_VERSION}-src/ext/vrzno/config.m4: ${VRZNO_EXTENSION_STAMP}
	@test -f "$@"
