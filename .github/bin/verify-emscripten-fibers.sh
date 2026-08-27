#!/usr/bin/env bash

set -euo pipefail

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT
cd "${WORK_DIR}"

cat > fiber-main-module.c <<'EOF'
#include <emscripten/fiber.h>
#include <stdio.h>
#include <stdlib.h>

#define ASYNCIFY_STACK_SIZE (16 * 1024)
#define C_STACK_SIZE (64 * 1024)

static emscripten_fiber_t main_fiber;
static emscripten_fiber_t child_fiber;
static unsigned char main_asyncify_stack[ASYNCIFY_STACK_SIZE];
static unsigned char child_asyncify_stack[ASYNCIFY_STACK_SIZE];
static _Alignas(16) unsigned char child_c_stack[C_STACK_SIZE];
static int child_stage;

static void child_entry(void *argument) {
	(void) argument;

	child_stage = 1;
	puts("child:one");
	emscripten_fiber_swap(&child_fiber, &main_fiber);

	child_stage = 2;
	puts("child:two");
	emscripten_fiber_swap(&child_fiber, &main_fiber);

	abort();
}

int main(void) {
	emscripten_fiber_init_from_current_context(
		&main_fiber,
		main_asyncify_stack,
		sizeof(main_asyncify_stack));
	emscripten_fiber_init(
		&child_fiber,
		child_entry,
		NULL,
		child_c_stack,
		sizeof(child_c_stack),
		child_asyncify_stack,
		sizeof(child_asyncify_stack));

	puts("main:one");
	emscripten_fiber_swap(&main_fiber, &child_fiber);
	if (child_stage != 1) {
		return 1;
	}

	puts("main:two");
	emscripten_fiber_swap(&main_fiber, &child_fiber);
	if (child_stage != 2) {
		return 2;
	}

	puts("fibers:ok");
	return 0;
}
EOF

emcc fiber-main-module.c \
	-O2 \
	-flto \
	-sASYNCIFY=1 \
	-sMAIN_MODULE=1 \
	-sENVIRONMENT=node \
	-sEXIT_RUNTIME=1 \
	-o fiber-main-module.js

expected=$'main:one\nchild:one\nmain:two\nchild:two\nfibers:ok'
actual="$(node fiber-main-module.js)"

if [[ "${actual}" != "${expected}" ]]; then
	echo 'Emscripten MAIN_MODULE=1 fiber smoke test produced unexpected output' >&2
	printf 'expected:\n%s\nactual:\n%s\n' "${expected}" "${actual}" >&2
	exit 1
fi

echo 'Emscripten MAIN_MODULE=1 fiber checks passed'
