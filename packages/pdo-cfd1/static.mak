#!/usr/bin/env make

PDO_CFD1_IMPORTER:=$(patsubst $(CURDIR)/%,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))import-source.mjs
PDO_CFD1_REPOSITORY?=https://github.com/seanmorris/pdo-cfd1.git
PDO_CFD1_REF?=1fd59a38565cc7e1b76fa2eeb7d0bc5825598402
PDO_CFD1_SOURCE_STAMP?=third_party/pdo-cfd1/.php-wasm-source.json
PDO_CFD1_EXTENSION_STAMP?=third_party/php${PHP_VERSION}-src/ext/pdo_cfd1/.php-wasm-source.json
pdo_cfd1_shell_quote = '$(subst ','"'"',$(1))'

.PHONY: pdo-cfd1-import-check
pdo-cfd1-import-check:

# Check content and active identity every time, preserving mtimes on no-ops.
${PDO_CFD1_SOURCE_STAMP}: SHELL := /bin/bash
${PDO_CFD1_SOURCE_STAMP}: .SHELLFLAGS := -e -o pipefail -c
${PDO_CFD1_SOURCE_STAMP}: pdo-cfd1-import-check
ifdef PDO_CFD1_DEV_PATH
	@node $(call pdo_cfd1_shell_quote,${PDO_CFD1_IMPORTER}) snapshot $(call pdo_cfd1_shell_quote,${PDO_CFD1_DEV_PATH}) $(call pdo_cfd1_shell_quote,${PHP_VERSION}) | ${DOCKER_RUN} node $(call pdo_cfd1_shell_quote,${PDO_CFD1_IMPORTER}) stage --stdin
else
	@${DOCKER_RUN} node $(call pdo_cfd1_shell_quote,${PDO_CFD1_IMPORTER}) stage $(call pdo_cfd1_shell_quote,${PDO_CFD1_REPOSITORY}) $(call pdo_cfd1_shell_quote,${PDO_CFD1_REF})
endif

${PDO_CFD1_EXTENSION_STAMP}: ${PDO_CFD1_SOURCE_STAMP} third_party/php${PHP_VERSION}-src/.gitignore pdo-cfd1-import-check
	@${DOCKER_RUN} node $(call pdo_cfd1_shell_quote,${PDO_CFD1_IMPORTER}) sync $(call pdo_cfd1_shell_quote,${PHP_VERSION})

# Compatibility targets only verify imported files; the builder owns writes.
third_party/pdo-cfd1/pdo_cfd1.c third_party/pdo-cfd1/config.m4 third_party/pdo-cfd1/README.md: ${PDO_CFD1_SOURCE_STAMP}
	@test -f "$@"

third_party/php${PHP_VERSION}-src/ext/pdo_cfd1/pdo_cfd1.c third_party/php${PHP_VERSION}-src/ext/pdo_cfd1/config.m4: ${PDO_CFD1_EXTENSION_STAMP}
	@test -f "$@"
