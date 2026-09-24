# Browser PHP/SDL through the ordinary Make build and shared runtime packager.
# Extension and codec settings may be overridden exactly as in a custom .env.
WITH_SDL := 1
BUILD_WORKSPACE ?= $(if $(filter sdl-mjs,${MAKECMDGOALS}),${ENV_DIR}/.cache/build,)
BUILD_WORKSPACE_TARGETS = $(filter-out test-sdl-package,${MAKECMDGOALS})
MAKE_SHUFFLE :=
