include Makefile

# The outer build knows when archives and generated JavaScript change. The
# native PHP build must also track them, including outputs kept for Cloudflare.
PHP_WASM_LINK_DEPS ?=
$(SAPI_CLI_PATH) $(SAPI_CGI_PATH) $(SAPI_PHPDBG_PATH): $(PHP_WASM_LINK_DEPS)

EXTRA_LIBS:=$(sort $(filter-out ${SKIP_LIBS}, ${EXTRA_LIBS}))

CFLAGS_CLEAN:=$(sort $(filter-out -g -O2, ${CFLAGS_CLEAN}))

print:
	echo ${EXTRA_LIBS}
