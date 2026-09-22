/*
  +----------------------------------------------------------------------+
  | Copyright (c) 1997-2018 The PHP Group                                |
  +----------------------------------------------------------------------+
  | This source file is subject to version 3.01 of the PHP license,      |
  | that is bundled with this package in the file LICENSE, and is        |
  | available through the world-wide-web at the following url:           |
  | https://www.php.net/license/3_01.txt                                 |
  | If you did not receive a copy of the PHP license and are unable to   |
  | obtain it through the world-wide-web, please send a note to          |
  | license@php.net so we can mail you a copy immediately.               |
  +----------------------------------------------------------------------+
  | Authors: Santiago Lizardo <santiagolizardo@php.net>                  |
  |          Remi Collet <remi@php.net>                                  |
  +----------------------------------------------------------------------+
*/


/*
  +----------------------------------------------------------------------+
  | wrapper for SDL2/SDL_video.h (only SDL_GLContext)                    |
  +----------------------------------------------------------------------+
  | class SDL_GLContext                                                  |
  +----------------------------------------------------------------------+
*/

/* Functions not wrapped

 extern DECLSPEC int SDLCALL SDL_GL_LoadLibrary(const char *path);
 extern DECLSPEC void *SDLCALL SDL_GL_GetProcAddress(const char *proc);
 extern DECLSPEC void SDLCALL SDL_GL_UnloadLibrary(void);
*/

#include "php_sdl.h"
#include "glcontext.h"
#include "window.h"
#include "php_sdl_extra.h"
#include "zend_interfaces.h"

static zend_class_entry *php_sdl_glcontext_ce;
static zend_object_handlers php_sdl_glcontext_handlers;
struct php_sdl_glcontext {
	SDL_GLContext glcontext;
	SDL_Window   *window;
	struct php_sdl_glcontext *next;
	Uint32        flags;
	zend_object   zo;
};

static struct php_sdl_glcontext *contexts;

static struct php_sdl_glcontext *context_object(zend_object *object)
{
	return (struct php_sdl_glcontext *)((char *)object - XtOffsetOf(struct php_sdl_glcontext, zo));
}

void php_sdl_context_invalidate(SDL_GLContext context)
{
	for (struct php_sdl_glcontext *item = contexts; item; item = item->next) {
		if (item->glcontext == context) { item->glcontext = NULL; item->window = NULL; }
	}
}

SDL_Window *php_sdl_context_window(SDL_GLContext context)
{
	for (struct php_sdl_glcontext *item = contexts; item; item = item->next) {
		if (item->glcontext == context) { return item->window; }
	}
	return NULL;
}

void php_sdl_contexts_close(SDL_Window *window)
{
	for (struct php_sdl_glcontext *item = contexts; item; item = item->next) {
		if (item->glcontext && (!window || item->window == window)) {
			if (!(item->flags & SDL_DONTFREE)) { SDL_GL_DeleteContext(item->glcontext); }
			else { item->glcontext = NULL; item->window = NULL; }
		}
	}
}

zend_bool php_sdl_context_available(void)
{
#ifdef __EMSCRIPTEN__
	/* The pinned EGL shim represents every SDL GL context with one fixed ID. */
	if (SDL_GL_GetCurrentContext() || php_sdl_renderer_owns_context(NULL)) {
		zend_throw_error(NULL, "the browser SDL backend supports one live GL context; close it before creating another"); return 0;
	}
	for (struct php_sdl_glcontext *item = contexts; item; item = item->next) {
		if (item->glcontext) {
			zend_throw_error(NULL, "the browser SDL backend supports one live GL context; close it before creating another"); return 0;
		}
	}
#endif
	return 1;
}


/* {{{ get_php_sdl_glcontext_ce */
zend_class_entry *get_php_sdl_glcontext_ce(void)
{
	return php_sdl_glcontext_ce;
}
/* }}} */


#define FETCH_GLCONTEXT(__ptr, __id, __check) \
{ \
		zend_object* zox = Z_OBJ_P(__id);\
		intern = (struct php_sdl_glcontext*)((char*)zox - zox->handlers->offset);\
        __ptr = intern->glcontext; \
        if (__check && !__ptr) {\
                zend_throw_error(NULL, "SDL GL context has been destroyed");\
                RETURN_THROWS();\
        }\
}

/* {{{ sdl_glcontext_to_zval */
zend_bool sdl_glcontext_to_zval(SDL_GLContext glcontext, zval *z_val, Uint32 flags)
{
	if (glcontext) {
		struct php_sdl_glcontext *intern;

		object_init_ex(z_val, php_sdl_glcontext_ce);
		zend_object* zo = Z_OBJ_P(z_val);
		intern = (struct php_sdl_glcontext*)((char*)zo - zo->handlers->offset);
		intern->glcontext = glcontext;
		intern->window = SDL_GL_GetCurrentWindow();
		intern->flags = flags;

		return 1;
	}
	ZVAL_NULL(z_val);
	return 0;
}
/* }}} */


/* {{{ zval_to_sdl_glcontext */
SDL_GLContext zval_to_sdl_glcontext(zval *z_val)
{
	struct php_sdl_glcontext *intern;

	if (Z_TYPE_P(z_val) == IS_OBJECT && instanceof_function(Z_OBJCE_P(z_val), php_sdl_glcontext_ce)) {
		zend_object* zo = Z_OBJ_P(z_val);
		intern = (struct php_sdl_glcontext*)((char*)zo - zo->handlers->offset);
		return intern->glcontext;
	}
	return NULL;
}
/* }}} */


/* {{{ php_sdl_glcontext_free
	 */
static void php_sdl_glcontext_free(zend_object *zo)
{
	struct php_sdl_glcontext* intern = (struct php_sdl_glcontext*)((char*)zo - zo->handlers->offset);

	if (intern->glcontext) {
		if (!(intern->flags & SDL_DONTFREE)) {
			SDL_GL_DeleteContext(intern->glcontext);
		}
	}

	struct php_sdl_glcontext **link = &contexts;
	while (*link != intern) { link = &(*link)->next; }
	*link = intern->next;
	zend_object_std_dtor(&intern->zo);
}
/* }}} */


/* {{{ php_sdl_glcontext_new
 */
static zend_object* php_sdl_glcontext_new(zend_class_entry *class_type)
{
	struct php_sdl_glcontext *intern;

	intern = (struct php_sdl_glcontext*)ecalloc(1, sizeof(struct php_sdl_glcontext) + zend_object_properties_size(class_type));

	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);

	intern->glcontext = NULL;
	intern->next = contexts;
	contexts = intern;

	intern->zo.handlers = (zend_object_handlers*)&php_sdl_glcontext_handlers;

	return &intern->zo;
}
/* }}} */


/* {{{ proto bool SDL_GL_ExtensionSupported(string extension)

 *  \brief Return true if an OpenGL extension is supported for the current
 *         context.
 extern DECLSPEC SDL_bool SDLCALL SDL_GL_ExtensionSupported(const char
                                                            *extension);
 */
PHP_FUNCTION(SDL_GL_ExtensionSupported)
{
	char *ext;
	size_t ext_len;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "s", &ext, &ext_len)) {
		return;
	}
	RETVAL_BOOL(SDL_GL_ExtensionSupported(ext) == SDL_TRUE);
}
/* }}} */

/* {{{ proto int SDL_GL_SetAttribute(int attr, int value)

 *  \brief Set an OpenGL window attribute before window creation.
 extern DECLSPEC int SDLCALL SDL_GL_SetAttribute(SDL_GLattr attr, int value);
 */
PHP_FUNCTION(SDL_GL_SetAttribute)
{
	zend_long attr, value;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "ll", &attr, &value)) {
		return;
	}
	RETVAL_LONG(SDL_GL_SetAttribute((SDL_GLattr)attr, (int)value));
}
/* }}} */


/* {{{ proto int SDL_GL_GetAttribute(int attr, int &value)

 *  \brief Get the actual value for an attribute from the current context.
 extern DECLSPEC int SDLCALL SDL_GL_GetAttribute(SDL_GLattr attr, int *value);
 */
PHP_FUNCTION(SDL_GL_GetAttribute)
{
	zend_long attr;
	zval *z_value;
	int ret, value;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "lz", &attr, &z_value)) {
		return;
	}
	ret = SDL_GL_GetAttribute((SDL_GLattr)attr, &value);
	if (ret == 0) {
		ZEND_TRY_ASSIGN_REF_LONG(z_value, value);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETVAL_LONG(ret);
}
/* }}} */


/* {{{ proto SDL_GLContext::__construct(void) */
PHP_METHOD(SDL_GLContext, __construct)
{
	struct php_sdl_glcontext *intern;
	zend_error_handling error_handling;
	zval *z_window;
	SDL_Window *window;

	intern = context_object(Z_OBJ_P(getThis()));

	zend_replace_error_handling(EH_THROW, NULL, &error_handling);
	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "O", &z_window, get_php_sdl_window_ce())) {
		zend_restore_error_handling(&error_handling);
		return;
	}
	zend_restore_error_handling(&error_handling);
	if (intern->glcontext) { zend_throw_error(NULL, "SDL GL context is already initialized"); RETURN_THROWS(); }
	if (!php_sdl_context_available()) { RETURN_THROWS(); }

	window = zval_to_sdl_window(z_window);
	if (window) {
		intern->glcontext = SDL_GL_CreateContext(window);
		if (intern->glcontext) {
			intern->flags = 0;
			intern->window = window;
		} else {
			zend_throw_exception(zend_ce_exception, SDL_GetError(), 0);
		}
	} else {
		zend_throw_error(NULL, "SDL window has been destroyed");
	}
}
/* }}} */


/* {{{ proto SDL_GLContext::__toString() */
PHP_METHOD(SDL_GLContext, __toString)
{
	struct php_sdl_glcontext *intern;

	if (zend_parse_parameters_none() == FAILURE) {
		return;
	}

	intern = context_object(Z_OBJ_P(getThis()));
	if (intern->glcontext) {
		RETURN_STR(strpprintf(0, "SDL_GLContext(%lx)", (unsigned long)intern->glcontext));
	} else {
		RETVAL_STRING("SDL_GLContext()");
	}
}
/* }}} */


/* {{{ proto SDL_GLContext SDL_GL_CreateContext(SDL_Window window)

 *  \brief Create an OpenGL context for use with an OpenGL window, and make it
 *         current.
 *
 *  \sa SDL_GL_DeleteContext()
 extern DECLSPEC SDL_GLContext SDLCALL SDL_GL_CreateContext(SDL_Window *
                                                            window);
 */
PHP_FUNCTION(SDL_GL_CreateContext)
{
	SDL_GLContext context;
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, get_php_sdl_window_ce())) {
		return;
	}
	window = zval_to_sdl_window(z_window);
	if (window) {
		if (!php_sdl_context_available()) { RETURN_THROWS(); }
		context = SDL_GL_CreateContext(window);
		sdl_glcontext_to_zval(context, return_value, 0);
	} else {
		zend_throw_error(NULL, "SDL window has been destroyed"); RETURN_THROWS();
	}
}
/* }}} */


/* {{{ proto void SDL_GL_DeleteContext(SDL_GLContext context)

 *  \brief Delete an OpenGL context.
 *
 *  \sa SDL_GL_CreateContext()
 extern DECLSPEC void SDLCALL SDL_GL_DeleteContext(SDL_GLContext context);
 */
PHP_FUNCTION(SDL_GL_DeleteContext)
{
	struct php_sdl_glcontext *intern;
	zval *z_context;
	SDL_GLContext context;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_context, php_sdl_glcontext_ce) == FAILURE) {
		return;
	}
	FETCH_GLCONTEXT(context, z_context, 0);
	if (!context) { return; }
	if (php_sdl_renderer_owns_context(context)) {
		zend_throw_error(NULL, "SDL renderer owns this GL context; destroy the renderer instead"); RETURN_THROWS();
	}
	SDL_GL_DeleteContext(context);
}
/* }}} */


#if SDL_VERSION_ATLEAST(2,0,1)
/* {{{ proto int SDL_GL_MakeCurrent(SDL_Window window, SDL_GLContext context)

 *  \brief Set up an OpenGL context for rendering into an OpenGL window.
 *
 *  \note The context must have been created with a compatible window.
 extern DECLSPEC int SDLCALL SDL_GL_MakeCurrent(SDL_Window * window,
                                                SDL_GLContext context);
 */
PHP_FUNCTION(SDL_GL_MakeCurrent)
{
	struct php_sdl_glcontext *intern;
	zval *z_context, *z_window;
	SDL_GLContext context;
	SDL_Window *window;

	/* The method parser skips exactly one leading type character for $this;
	 * it cannot consume a nullable "O!" in that position. */
	if (execute_data->func->common.scope && getThis()) {
		z_window = getThis();
		if (zend_parse_parameters(ZEND_NUM_ARGS(), "O!", &z_context, php_sdl_glcontext_ce) == FAILURE) { RETURN_THROWS(); }
	} else if (zend_parse_parameters(ZEND_NUM_ARGS(), "O!O!", &z_window, get_php_sdl_window_ce(), &z_context, php_sdl_glcontext_ce) == FAILURE) {
		RETURN_THROWS();
	}
	context = NULL;
	if (z_context) { FETCH_GLCONTEXT(context, z_context, 1); }
	window = z_window ? zval_to_sdl_window(z_window) : NULL;
	if (z_window && !window) {
		zend_throw_error(NULL, "SDL window has been destroyed"); RETURN_THROWS();
	}
	RETVAL_LONG(SDL_GL_MakeCurrent(window, context));
}
/* }}} */


/* {{{ proto SDL_Window SDL_GL_GetCurrentWindow(void)

 *  \brief Get the currently active OpenGL window.
 extern DECLSPEC SDL_Window* SDLCALL SDL_GL_GetCurrentWindow(void);
 */
PHP_FUNCTION(SDL_GL_GetCurrentWindow)
{
	if (zend_parse_parameters_none() == FAILURE) {
		return;
	}
	sdl_window_to_zval(SDL_GL_GetCurrentWindow(), return_value, SDL_DONTFREE);
}


/* {{{ proto SDL_GLContext SDL_GL_GetCurrentContext(void)

 *  \brief Get the currently active OpenGL context.
 extern DECLSPEC SDL_GLContext SDLCALL SDL_GL_GetCurrentContext(void);
 */
PHP_FUNCTION(SDL_GL_GetCurrentContext)
{
	if (zend_parse_parameters_none() == FAILURE) {
		return;
	}
	sdl_glcontext_to_zval(SDL_GL_GetCurrentContext(), return_value, SDL_DONTFREE);
}

/* {{{ proto void SDL_GL_GetDrawableSize(SDL_Window window, int &w, int &h)

 *  \brief Get the size of a window's underlying drawable (for use with glViewport).
 *
 *  \param window   Window from which the drawable size should be queried
 *  \param w        Pointer to variable for storing the width, may be NULL
 *  \param h        Pointer to variable for storing the height, may be NULL
 *
 * This may differ from SDL_GetWindowSize if we're rendering to a high-DPI
 * drawable, i.e. the window was created with SDL_WINDOW_ALLOW_HIGHDPI on a
 * platform with high-DPI support (Apple calls this "Retina"), and not disabled
 * by the SDL_HINT_VIDEO_HIGHDPI_DISABLED hint.
 *
 *  \sa SDL_GetWindowSize()
 *  \sa SDL_CreateWindow()
 extern DECLSPEC void SDLCALL SDL_GL_GetDrawableSize(SDL_Window * window, int *w,
                                                     int *h);
 */
PHP_FUNCTION(SDL_GL_GetDrawableSize)
{
	zval *z_w, *z_h, *z_window;
	SDL_Window *window;
	int w, h;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ozz", &z_window, get_php_sdl_window_ce(), &z_w, &z_h)) {
		return;
	}
	window = zval_to_sdl_window(z_window);
	if (window) {
		SDL_GL_GetDrawableSize(window, &w, &h);
		ZEND_TRY_ASSIGN_REF_LONG(z_w, w); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_h, h); if (EG(exception)) { RETURN_THROWS(); }
	} else {
		zend_throw_error(NULL, "SDL window has been destroyed"); RETURN_THROWS();
	}
}
/* }}} */
#endif

/* {{{ proto void SDL_GL_SwapWindow(SDL_Window window)

 * \brief Swap the OpenGL buffers for a window, if double-buffering is
 *        supported.
 extern DECLSPEC void SDLCALL SDL_GL_SwapWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GL_SwapWindow)
{
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, get_php_sdl_window_ce())) {
		return;
	}
	window = zval_to_sdl_window(z_window);
	if (window) {
		SDL_GL_SwapWindow(window);
	} else {
		zend_throw_error(NULL, "SDL window has been destroyed"); RETURN_THROWS();
	}
}
/* }}} */


/* {{{ proto int SDL_GL_SetSwapInterval(int interval)

 *  \brief Set the swap interval for the current OpenGL context.
 *
 *  \param interval 0 for immediate updates, 1 for updates synchronized with the
 *                  vertical retrace. If the system supports it, you may
 *                  specify -1 to allow late swaps to happen immediately
 *                  instead of waiting for the next retrace.
 *
 *  \return 0 on success, or -1 if setting the swap interval is not supported.
 *
 *  \sa SDL_GL_GetSwapInterval()
 extern DECLSPEC int SDLCALL SDL_GL_SetSwapInterval(int interval);
 */
PHP_FUNCTION(SDL_GL_SetSwapInterval)
{
	zend_long value;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "l", &value)) {
		return;
	}
	RETVAL_LONG(SDL_GL_SetSwapInterval((int)value));
}
/* }}} */


/* {{{ proto int SDL_GL_GetSwapInterval()

 *  \brief Get the swap interval for the current OpenGL context.
 *
 *  \return 0 if there is no vertical retrace synchronization, 1 if the buffer
 *          swap is synchronized with the vertical retrace, and -1 if late
 *          swaps happen immediately instead of waiting for the next retrace.
 *          If the system can't determine the swap interval, or there isn't a
 *          valid current context, this will return 0 as a safe default.
 *
 *  \sa SDL_GL_SetSwapInterval()
 extern DECLSPEC int SDLCALL SDL_GL_GetSwapInterval(void);
 */
PHP_FUNCTION(SDL_GL_GetSwapInterval)
{
	if (zend_parse_parameters_none() == FAILURE) {
		return;
	}
	RETVAL_LONG(SDL_GL_GetSwapInterval());
}
/* }}} */


/* {{{ sdl_glcontext_methods[] */
static const zend_function_entry php_sdl_glcontext_methods[] = {
	PHP_ME(SDL_GLContext,       __construct,                arginfo_SDL_GLContext__construct,     ZEND_ACC_CTOR|ZEND_ACC_PUBLIC)
	PHP_ME(SDL_GLContext,       __toString,                 arginfo_sdl_to_string,                         ZEND_ACC_PUBLIC)

	/* non-static method */
	PHP_FALIAS(Delete,          SDL_GL_DeleteContext,       arginfo_none)

	/* static functions */
	ZEND_FENTRY(GL_GetCurrent,      ZEND_FN(SDL_GL_GetCurrentContext),    arginfo_none,           ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)

	ZEND_FE_END
};
/* }}} */

#define REGISTER_GL_CLASS_CONST_LONG(const_name, value) \
	REGISTER_LONG_CONSTANT("SDL_GL_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_glcontext_ce, const_name, sizeof(const_name)-1, value)

#define REGISTER_GLCONTEXT_CLASS_CONST_LONG(const_name, value) \
	REGISTER_LONG_CONSTANT("SDL_GL_CONTEXT_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_glcontext_ce, const_name, sizeof(const_name)-1, value)


/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_glcontext)
{
	zend_class_entry ce;

	INIT_CLASS_ENTRY(ce, "SDL_GLContext", php_sdl_glcontext_methods);
	php_sdl_glcontext_ce = zend_register_internal_class(&ce);
	php_sdl_glcontext_ce->create_object = php_sdl_glcontext_new;
	memcpy(&php_sdl_glcontext_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_glcontext_handlers.free_obj = php_sdl_glcontext_free;
	php_sdl_glcontext_handlers.offset = XtOffsetOf(struct php_sdl_glcontext, zo);
	php_sdl_glcontext_handlers.clone_obj = NULL;
	if (php_sdl_deny_serialization(php_sdl_glcontext_ce) != SUCCESS) { return FAILURE; }

	/* typedef enum SDL_GLattr; */
	REGISTER_GL_CLASS_CONST_LONG("RED_SIZE",                       SDL_GL_RED_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("GREEN_SIZE",                     SDL_GL_GREEN_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("BLUE_SIZE",                      SDL_GL_BLUE_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("ALPHA_SIZE",                     SDL_GL_ALPHA_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("BUFFER_SIZE",                    SDL_GL_BUFFER_SIZE),
	REGISTER_GL_CLASS_CONST_LONG("DOUBLEBUFFER",                   SDL_GL_DOUBLEBUFFER);
	REGISTER_GL_CLASS_CONST_LONG("DEPTH_SIZE",                     SDL_GL_DEPTH_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("STENCIL_SIZE",                   SDL_GL_STENCIL_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("ACCUM_RED_SIZE",                 SDL_GL_ACCUM_RED_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("ACCUM_GREEN_SIZE",               SDL_GL_ACCUM_GREEN_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("ACCUM_BLUE_SIZE",                SDL_GL_ACCUM_BLUE_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("ACCUM_ALPHA_SIZE",               SDL_GL_ACCUM_ALPHA_SIZE);
	REGISTER_GL_CLASS_CONST_LONG("STEREO",                         SDL_GL_STEREO);
	REGISTER_GL_CLASS_CONST_LONG("MULTISAMPLEBUFFERS",             SDL_GL_MULTISAMPLEBUFFERS);
	REGISTER_GL_CLASS_CONST_LONG("MULTISAMPLESAMPLES",             SDL_GL_MULTISAMPLESAMPLES),
	REGISTER_GL_CLASS_CONST_LONG("ACCELERATED_VISUAL",             SDL_GL_ACCELERATED_VISUAL);
	REGISTER_GL_CLASS_CONST_LONG("RETAINED_BACKING",               SDL_GL_RETAINED_BACKING);
	REGISTER_GL_CLASS_CONST_LONG("SHARE_WITH_CURRENT_CONTEXT",     SDL_GL_SHARE_WITH_CURRENT_CONTEXT);

#if SDL_VERSION_ATLEAST(2,0,1)
	REGISTER_GL_CLASS_CONST_LONG("FRAMEBUFFER_SRGB_CAPABLE",       SDL_GL_FRAMEBUFFER_SRGB_CAPABLE);
#endif
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("MAJOR_VERSION",           SDL_GL_CONTEXT_MAJOR_VERSION);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("MINOR_VERSION",           SDL_GL_CONTEXT_MINOR_VERSION);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("EGL",                     SDL_GL_CONTEXT_EGL);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("FLAGS",                   SDL_GL_CONTEXT_FLAGS);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("PROFILE_MASK",            SDL_GL_CONTEXT_PROFILE_MASK);

	/* typedef enum SDL_GLprofile; */
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("PROFILE_CORE",            SDL_GL_CONTEXT_PROFILE_CORE);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("PROFILE_COMPATIBILITY",   SDL_GL_CONTEXT_PROFILE_COMPATIBILITY);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("PROFILE_ES",              SDL_GL_CONTEXT_PROFILE_ES);

	/* typedef enum SDL_GLcontextFlag; */
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("DEBUG_FLAG",              SDL_GL_CONTEXT_DEBUG_FLAG);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("FORWARD_COMPATIBLE_FLAG", SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("ROBUST_ACCESS_FLAG",      SDL_GL_CONTEXT_ROBUST_ACCESS_FLAG);
	REGISTER_GLCONTEXT_CLASS_CONST_LONG("RESET_ISOLATION_FLAG",    SDL_GL_CONTEXT_RESET_ISOLATION_FLAG);

	return SUCCESS;
}
/* }}} */
