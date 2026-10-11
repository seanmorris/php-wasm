/* Optional structured browser debugger bridge. Legacy console output is retained. */
#ifndef PHPDBG_WASM_BRIDGE_H
#define PHPDBG_WASM_BRIDGE_H
#include <emscripten.h>
#include "phpdbg_out.h"
ZEND_EXTERN_MODULE_GLOBALS(phpdbg)
int phpdbg_wasm_checkpoint(void);
void phpdbg_wasm_output(int type, int fd, const char *text, int length, int evaluating);
void phpdbg_wasm_event(const char *type, const char *name, const char *message, const char *file, int line, int status);

#ifdef PHPDBG_WASM_BRIDGE_IMPL
EMSCRIPTEN_KEEPALIVE int php_wasm_dbg_bridge_version(void) { return 1; }
EMSCRIPTEN_KEEPALIVE int php_wasm_dbg_has_context(void) { return PHPDBG_G(ops) != NULL; }

EM_ASYNC_JS(int, phpdbg_wasm_checkpoint_js, (void), {
    if (!Module['dbgYieldInterval']) return 0;
    const now = performance.now();
    if (now >= (Module.dbgNextYield || 0)) {
        Module.dbgNextYield = now + Module['dbgYieldInterval'];
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (Module.dbgStopRequested) return 2;
    if (Module.dbgPauseRequested) { Module.dbgPauseRequested = false; return 1; }
    return 0;
});
/* Other translation units call a C function, not EM_ASYNC_JS's import alias. */
int phpdbg_wasm_checkpoint(void) { return phpdbg_wasm_checkpoint_js(); }

EM_JS(void, phpdbg_wasm_output, (int type, int fd, const char *text, int length, int evaluating), {
    if (Module['onDbgOutput']) Module['onDbgOutput']({type, fd, bytes: HEAPU8.slice(text, text + length), evaluating: !!evaluating});
});

EM_JS(void, phpdbg_wasm_event, (const char *type, const char *name, const char *message, const char *file, int line, int status), {
    if (Module['onDbgEvent']) Module['onDbgEvent']({type: UTF8ToString(type), name: name ? UTF8ToString(name) : null,
        message: message ? UTF8ToString(message) : null, file: file ? UTF8ToString(file) : null, line, status});
});
#endif
#endif
