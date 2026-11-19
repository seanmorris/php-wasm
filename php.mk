include Makefile

# The outer build knows when archives and generated JavaScript change. The
# native PHP build must also track them, including outputs kept for Cloudflare.
PHP_WASM_LINK_DEPS ?=
$(SAPI_CLI_PATH) $(SAPI_CGI_PATH) $(SAPI_PHPDBG_PATH): $(PHP_WASM_LINK_DEPS)

EXTRA_LIBS:=$(sort $(filter-out ${SKIP_LIBS}, ${EXTRA_LIBS}))

# PHP's configure defaults to "-g -O2".  The outer build chooses both instead:
# symbols through SYMBOL_FLAGS and the optimisation level through the
# -O${OPTIMIZE} it puts in EXTRA_CFLAGS.  Removing the level here without that
# replacement compiles the whole interpreter unoptimised.
CFLAGS_CLEAN:=$(sort $(filter-out -g -O2, ${CFLAGS_CLEAN}))

# Flags for PHP's compiler alone, after everything else, so they win.  The
# outer Makefile explains the default.
PHP_WASM_COMPILER_CFLAGS ?=
Zend/zend_compile.lo: override EXTRA_CFLAGS += $(PHP_WASM_COMPILER_CFLAGS)

print:
	echo ${EXTRA_LIBS}
