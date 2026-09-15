# BUILD_WORKSPACE is an optional cache root for the normal Make build. Sources
# and configuration select a native workspace; Make owns all build commands.
.DEFAULT_GOAL := all
SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
BUILD_WORKSPACE_TARGETS ?= $(or ${MAKECMDGOALS},all)
.PHONY: build-workspace ${BUILD_WORKSPACE_TARGETS}
${BUILD_WORKSPACE_TARGETS}: build-workspace ;

BUILD_IMAGE ?= seanmorris/php-emscripten-builder:latest
BUILD_PACKAGES ?=
BUILD_WORKSPACE_COMMAND = node bin/prepare-build-workspace.mjs $(call shell_quote,${BUILD_WORKSPACE}) $(call shell_quote,${ENV_FILE}) $(call shell_quote,${PHP_VERSION}) $(call shell_quote,${MAKEOVERRIDES}) ${BUILD_PACKAGES}

# Recursive recipes run even under -n; keep dry runs free of snapshot writes.
ifneq ($(findstring n,$(filter-out --%,$(firstword ${MFLAGS}))),)
build-workspace:
	@echo $(call shell_quote,${BUILD_WORKSPACE_COMMAND})
else
build-workspace:
	+@mkdir -p $(call shell_quote,${BUILD_WORKSPACE}); \
	exec 9>$(call shell_quote,${BUILD_WORKSPACE}/.lock); flock 9; \
	build_image=$$(docker image inspect $(call shell_quote,${BUILD_IMAGE}) --format '{{.Id}}'); \
	build_directory=$$(BUILD_IMAGE_ID="$$build_image" ${BUILD_WORKSPACE_COMMAND}); \
	printf 'Build workspace: %s\n' "$$build_directory"; \
	HOST_PROJECT_ROOT="$$build_directory" BUILD_IMAGE="$$build_image" $(MAKE) --no-print-directory -C "$$build_directory" \
		${BUILD_WORKSPACE_TARGETS} $(call make_overrides,BUILD_WORKSPACE ENV_FILE ENV_DIR BUILD_IMAGE) \
		BUILD_WORKSPACE= BUILD_IMAGE="$$build_image" ENV_FILE=.build-env.mak ENV_DIR=$(call shell_quote,$(abspath ${ENV_DIR}))
endif
