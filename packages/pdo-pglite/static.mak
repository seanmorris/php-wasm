#!/usr/bin/env make

PDO_PGLITE_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
PDO_PGLITE_REPOSITORY?=https://github.com/seanmorris/pdo-pglite.git
PDO_PGLITE_REF?=6303e1f0e337b06f04cef162e6d1ca62ab4bd1ce
PDO_PGLITE_SOURCE_STAMP?=third_party/pdo-pglite/.php-wasm-source.json
PDO_PGLITE_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/pdo_pglite/.php-wasm-source.json
pdo_pglite_shell_quote = '$(subst ','"'"',$(1))'

.PHONY: pdo-pglite-import-check
pdo-pglite-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${PDO_PGLITE_SOURCE_STAMP}: SHELL := /bin/bash
${PDO_PGLITE_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${PDO_PGLITE_SOURCE_STAMP}: pdo-pglite-import-check
ifdef PDO_PGLITE_DEV_PATH
	@node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) snapshot $(call pdo_pglite_shell_quote,${PDO_PGLITE_DEV_PATH}) $(call pdo_pglite_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) stage $(call pdo_pglite_shell_quote,${PDO_PGLITE_REPOSITORY}) $(call pdo_pglite_shell_quote,${PDO_PGLITE_REF})
endif

${PDO_PGLITE_EXTENSION_STAMP}: ${PDO_PGLITE_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore pdo-pglite-import-check
	@${DOCKER_RUN} node $(call pdo_pglite_shell_quote,${PDO_PGLITE_IMPORTER}) sync $(call pdo_pglite_shell_quote,${PHP_VERSION})

# Compatibility targets only verify imported files; the builder owns writes.
third_party/pdo-pglite/pdo_pglite.c third_party/pdo-pglite/config.m4 third_party/pdo-pglite/README.md: ${PDO_PGLITE_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/pdo_pglite/pdo_pglite.c third_party/php${PHP_VERSION}-src/ext/pdo_pglite/config.m4: ${PDO_PGLITE_EXTENSION_STAMP}
	@test -f "$@"
