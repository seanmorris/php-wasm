#!/usr/bin/env bash

set -euo pipefail

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
cd "${WORK_DIR}"

cat > main.c <<'EOF'
#include <stdio.h>

int main(void) {
	puts("profile runtime smoke test");
	return 0;
}
EOF

assert_has_profile_runtime() {
	local wasm="$1"
	if ! grep -aFq 'default.profraw' "${wasm}"; then
		echo "profile runtime is missing from instrumented output: ${wasm}" >&2
		exit 1
	fi
}

assert_has_no_profile_runtime() {
	local wasm="$1"
	if grep -aFq 'default.profraw' "${wasm}"; then
		echo "profile runtime leaked into non-instrumented output: ${wasm}" >&2
		exit 1
	fi
}

emcc main.c \
	-sMAIN_MODULE=1 \
	-sNODERAWFS=1 \
	-sEXIT_RUNTIME=1 \
	-o plain-main.js
assert_has_no_profile_runtime plain-main.wasm
node plain-main.js >/dev/null
if [[ -e default.profraw ]]; then
	echo 'non-instrumented MAIN_MODULE=1 output created default.profraw' >&2
	exit 1
fi

emcc main.c \
	-fprofile-instr-generate \
	-sNODERAWFS=1 \
	-sEXIT_RUNTIME=1 \
	-o instrumented.js
assert_has_profile_runtime instrumented.wasm
node instrumented.js >/dev/null
if [[ ! -s default.profraw ]]; then
	echo 'instrumented output did not create a non-empty default.profraw' >&2
	exit 1
fi
rm default.profraw

# MAIN_MODULE must also select the archive when instrumentation references it.
# The regular instrumented binary above supplies the runtime execution check.
emcc main.c \
	-fprofile-instr-generate \
	-sMAIN_MODULE=1 \
	-sNODERAWFS=1 \
	-sEXIT_RUNTIME=1 \
	-o instrumented-main.js
assert_has_profile_runtime instrumented-main.wasm

cat > side.c <<'EOF'
int dynamic_answer(void) {
	return 42;
}
EOF

cat > dynamic-main.c <<'EOF'
#include <dlfcn.h>
#include <stdio.h>

typedef int (*answer_fn)(void);

int main(void) {
	void *handle = dlopen("./libanswer.so", RTLD_NOW);
	if (!handle) {
		fprintf(stderr, "dlopen: %s\n", dlerror());
		return 1;
	}

	answer_fn answer = (answer_fn)dlsym(handle, "dynamic_answer");
	if (!answer) {
		fprintf(stderr, "dlsym: %s\n", dlerror());
		return 2;
	}

	int result = answer();
	dlclose(handle);
	return result == 42 ? 0 : 3;
}
EOF

# Match php-wasm's source -> static archive -> side module build path.
emcc -fPIC -c side.c -o side.o
emar rcs libanswer.a side.o
emcc \
	-sSIDE_MODULE=1 \
	-Wl,--whole-archive \
	libanswer.a \
	-Wl,--no-whole-archive \
	-o libanswer.so
emcc dynamic-main.c \
	-sMAIN_MODULE=1 \
	-sNODERAWFS=1 \
	-sEXIT_RUNTIME=1 \
	-o dynamic-main.js
assert_has_no_profile_runtime dynamic-main.wasm
node dynamic-main.js
if [[ -e default.profraw ]]; then
	echo 'dynamic MAIN_MODULE=1 smoke test created default.profraw' >&2
	exit 1
fi

echo 'Emscripten profile runtime checks passed'
