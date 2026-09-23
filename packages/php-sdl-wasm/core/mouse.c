/*
  +----------------------------------------------------------------------+
  | Copyright (c) 1997-2022 The PHP Group                                |
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

#include "mouse.h"
#include "surface.h"
#include "window.h"
#include "php_sdl_extra.h"
#include "zend_interfaces.h"
#include <limits.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
extern void php_sdl_pointer_attach(unsigned int id);
extern int php_sdl_pointer_begin(unsigned int id, int enabled);
extern int php_sdl_pointer_end(void);
extern int php_sdl_pointer_owns(unsigned int id);
extern void php_sdl_pointer_detach(void);

int __real_SDL_SetRelativeMouseMode(SDL_bool enabled);

/* Promise callbacks may arrive after native window destruction or PHP refresh.
 * JavaScript guards the request generation; this checks the native window ID. */
EMSCRIPTEN_KEEPALIVE void php_sdl_pointer_error(Uint32 id, const char *message)
{
	if (id && SDL_GetWindowFromID(id)) { SDL_SetError("%s", message); }
}

int __wrap_SDL_SetRelativeMouseMode(SDL_bool enabled)
{
	SDL_Window *window = SDL_GetMouseFocus();
	if (enabled && SDL_GetRelativeMouseMode()) { return 0; }
	if (enabled && !window) { return SDL_SetError("Browser pointer lock requires a focused SDL window"); }
	if (!php_sdl_pointer_begin(window ? SDL_GetWindowID(window) : 0, enabled)) { return -1; }
	int result = __real_SDL_SetRelativeMouseMode(enabled);
	if (!php_sdl_pointer_end()) {
		/* SDL otherwise reports success after its unsupported warp fallback. */
		char *message = SDL_strdup(SDL_GetError());
		__wrap_SDL_SetRelativeMouseMode(SDL_FALSE);
		result = SDL_SetError("%s", message ? message : "Browser pointer lock request failed");
		SDL_free(message);
	}
	return result;
}
#endif

void php_sdl_pointer_window(SDL_Window *window)
{
#ifdef __EMSCRIPTEN__
	if (window) { php_sdl_pointer_attach(SDL_GetWindowID(window)); }
#endif
}

void php_sdl_pointer_cleanup(SDL_Window *window)
{
#ifdef __EMSCRIPTEN__
	if (!php_sdl_pointer_owns(window ? SDL_GetWindowID(window) : 0)) { return; }
	__wrap_SDL_SetRelativeMouseMode(SDL_FALSE);
	php_sdl_pointer_detach();
#endif
}

static zend_class_entry *php_sdl_cursor_ce;
static zend_object_handlers php_sdl_cursor_handlers;
struct php_sdl_cursor
{
	SDL_Cursor *cursor;
	Uint32 flags;
	zend_bool initialized;
	struct php_sdl_cursor *next;
	zend_object zo;
};

/* {{{ get_php_sdl_cursor_ce */
zend_class_entry *get_php_sdl_cursor_ce(void)
{
	return php_sdl_cursor_ce;
}
/* }}} */

static struct php_sdl_cursor *cursors;

static struct php_sdl_cursor *cursor_object(zend_object *object)
{
	return (struct php_sdl_cursor *)((char *)object - XtOffsetOf(struct php_sdl_cursor, zo));
}

static void cursor_close(struct php_sdl_cursor *object)
{
	SDL_Cursor *cursor = object->cursor;
	/* SDL owns its default cursor, and SDL_FreeCursor(default) is a no-op. */
	if (!cursor || cursor == SDL_GetDefaultCursor()) { return; }
	for (struct php_sdl_cursor *item = cursors; item; item = item->next) {
		if (item->cursor == cursor) { item->cursor = NULL; }
	}
	object->cursor = NULL;
	SDL_FreeCursor(cursor);
}

void php_sdl_cursors_invalidate(void)
{
	/* SDL permits software cursors before video initialization. Close owned
	 * cursors even when there is no video driver for native teardown to free. */
	for (struct php_sdl_cursor *item = cursors; item; item = item->next) {
		if (!(item->flags & SDL_DONTFREE)) { cursor_close(item); }
	}
	for (struct php_sdl_cursor *item = cursors; item; item = item->next) {
		item->cursor = NULL;
	}
}

static zend_bool cursor_bitmap_size(zend_long w, zend_long h, zend_long x, zend_long y,
	size_t data_len, size_t mask_len)
{
	/* SDL expands the bitmap to a 32-bit surface; validate that allocation too. */
	if (w <= 0 || w > INT_MAX || (w & 7) || h <= 0 || h > INT_MAX
		|| (uint64_t)w * (uint64_t)h > INT_MAX / 4) {
		zend_value_error("cursor dimensions must be positive, fit SDL's pixel buffer and have a width divisible by eight");
		return 0;
	}
	if (x < 0 || x >= w || y < 0 || y >= h) {
		zend_value_error("cursor hotspot must be inside its bitmap"); return 0;
	}
	size_t size = (size_t)w / 8 * (size_t)h;
	if (data_len != size || mask_len != size) {
		zend_value_error("cursor data and mask must each contain exactly %zu bytes", size); return 0;
	}
	return 1;
}

/* {{{ sdl_cursor_to_zval */
zend_bool sdl_cursor_to_zval(SDL_Cursor *cursor, zval *z_val, Uint32 flags)
{
	if (!cursor) { ZVAL_NULL(z_val); return 0; }
	/* Reuse the owner so aliases keep it alive without a strong global registry. */
	for (struct php_sdl_cursor *item = cursors; item; item = item->next) {
		if (item->cursor == cursor) { ZVAL_OBJ_COPY(z_val, &item->zo); return 1; }
	}
	object_init_ex(z_val, php_sdl_cursor_ce);
	struct php_sdl_cursor *intern = cursor_object(Z_OBJ_P(z_val));
	intern->cursor = cursor;
	intern->flags = flags;
	intern->initialized = 1;
	return 1;
}
/* }}} */

/* {{{ zval_to_sdl_cursor */
SDL_Cursor *zval_to_sdl_cursor(zval *z_val)
{
	if (Z_TYPE_P(z_val) == IS_OBJECT && instanceof_function(Z_OBJCE_P(z_val), php_sdl_cursor_ce)) {
		return cursor_object(Z_OBJ_P(z_val))->cursor;
	}
	return NULL;
}
/* }}} */

/* {{{ php_sdl_cursor_free */
static void php_sdl_cursor_free(zend_object *object)
{
	struct php_sdl_cursor *intern = cursor_object(object);
	if (intern->cursor && !(intern->flags & SDL_DONTFREE)) { cursor_close(intern); }
	struct php_sdl_cursor **link = &cursors;
	while (*link && *link != intern) { link = &(*link)->next; }
	if (*link) { *link = intern->next; }
	zend_object_std_dtor(object);
}
/* }}} */

/* {{{ php_sdl_cursor_new
 */
static zend_object *php_sdl_cursor_new(zend_class_entry *class_type)
{
	struct php_sdl_cursor *intern = zend_object_alloc(sizeof(*intern), class_type);
	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);
	intern->zo.handlers = &php_sdl_cursor_handlers;
	intern->next = cursors;
	cursors = intern;
	return &intern->zo;
}
/* }}} */

/* {{{ proto SDL_Cursor::__construct(void) */
static PHP_METHOD(SDL_Cursor, __construct)
{
	char *data, *mask;
	size_t data_len, mask_len;
	zend_long w, h, x, y;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "ssllll", &data, &data_len, &mask, &mask_len, &w, &h, &x, &y) == FAILURE) { return; }
	/* String conversion can run PHP and re-enter this constructor. */
	struct php_sdl_cursor *intern = cursor_object(Z_OBJ_P(getThis()));
	if (intern->initialized) { zend_throw_error(NULL, "SDL_Cursor is already initialized"); RETURN_THROWS(); }
	if (!cursor_bitmap_size(w, h, x, y, data_len, mask_len)) { RETURN_THROWS(); }
	intern->cursor = SDL_CreateCursor((Uint8 *)data, (Uint8 *)mask, (int)w, (int)h, (int)x, (int)y);
	if (!intern->cursor) { zend_throw_exception(zend_ce_exception, SDL_GetError(), 0); RETURN_THROWS(); }
	intern->flags = 0;
	intern->initialized = 1;
}
/* }}} */

/* {{{ proto SDL_Cursor::__toString()
 */
static PHP_METHOD(SDL_Cursor, __toString)
{
	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}
	RETVAL_STRING("SDL_Cursor()");
}
/* }}} */

/* {{{ proto SDL_Cursor SDL_CreateCursor(string data, string mask, int w, int h, int hot_x, int hot_y)

 *  \brief Create a cursor, using the specified bitmap data and
 *         mask (in MSB format).
 *
 *  The cursor width must be a multiple of 8 bits.
 *
 *  The cursor is created in black and white according to the following:
 *  <table>
 *  <tr><td> data </td><td> mask </td><td> resulting pixel on screen </td></tr>
 *  <tr><td>  0   </td><td>  1   </td><td> White </td></tr>
 *  <tr><td>  1   </td><td>  1   </td><td> Black </td></tr>
 *  <tr><td>  0   </td><td>  0   </td><td> Transparent </td></tr>
 *  <tr><td>  1   </td><td>  0   </td><td> Inverted color if possible, black
 *                                         if not. </td></tr>
 *  </table>
 *
 *  \sa SDL_FreeCursor()
 extern DECLSPEC SDL_Cursor *SDLCALL SDL_CreateCursor(const Uint8 * data,
													  const Uint8 * mask,
													  int w, int h, int hot_x,
													  int hot_y);
 */
PHP_FUNCTION(SDL_CreateCursor)
{
	char *data, *mask;
	size_t data_len, mask_len;
	zend_long w, h, x, y;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "ssllll", &data, &data_len, &mask, &mask_len, &w, &h, &x, &y) == FAILURE) { return; }
	if (!cursor_bitmap_size(w, h, x, y, data_len, mask_len)) { RETURN_THROWS(); }
	SDL_Cursor *cursor = SDL_CreateCursor((Uint8 *)data, (Uint8 *)mask, (int)w, (int)h, (int)x, (int)y);
	sdl_cursor_to_zval(cursor, return_value, 0);
}
/* }}} */

/* {{{ proto SDL_Cursor SDL_CreateSystemCursor(int id)

 *  \brief Create a system cursor.
 *
 *  \sa SDL_FreeCursor()
 extern DECLSPEC SDL_Cursor *SDLCALL SDL_CreateSystemCursor(SDL_SystemCursor id);
 */
PHP_FUNCTION(SDL_CreateSystemCursor)
{
	zend_long id;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &id) == FAILURE) { return; }
	if (id < 0 || id >= SDL_NUM_SYSTEM_CURSORS) { zend_value_error("invalid SDL system cursor ID"); RETURN_THROWS(); }
	sdl_cursor_to_zval(SDL_CreateSystemCursor((SDL_SystemCursor)id), return_value, 0);
}
/* }}} */

/* {{{ proto SDL_Cursor SDL_CreateSystemCursor(int id)

 *  \brief Create a color cursor.
 *
 *  \sa SDL_FreeCursor()
 extern DECLSPEC SDL_Cursor *SDLCALL SDL_CreateColorCursor(SDL_Surface *surface,
														   int hot_x,
														   int hot_y);
 */
PHP_FUNCTION(SDL_CreateColorCursor)
{
	zend_long x, y;
	zval *z_surface;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oll", &z_surface, get_php_sdl_surface_ce(), &x, &y) == FAILURE) { return; }
	SDL_Surface *surface = zval_to_sdl_surface(z_surface);
	if (!surface) { zend_throw_error(NULL, "SDL_Surface has been freed"); RETURN_THROWS(); }
	if (x < 0 || x >= surface->w || y < 0 || y >= surface->h) {
		zend_value_error("cursor hotspot must be inside its surface"); RETURN_THROWS();
	}
	sdl_cursor_to_zval(SDL_CreateColorCursor(surface, (int)x, (int)y), return_value, 0);
}
/* }}} */

/* {{{ proto void SDL_FreeCursor(SDL_Cursor cursor)

 *  \brief Frees a cursor created with SDL_CreateCursor().
 *
 *  \sa SDL_CreateCursor()
 extern DECLSPEC void SDLCALL SDL_FreeCursor(SDL_Cursor * cursor);
 */
PHP_FUNCTION(SDL_FreeCursor)
{
	zval *value;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_cursor_ce) == FAILURE) { return; }
	cursor_close(cursor_object(Z_OBJ_P(value)));
}
/* }}} */

/* {{{ proto void SDL_SetCursor(SDL_Cursor cursor)

 *  \brief Set the active cursor.
 extern DECLSPEC void SDLCALL SDL_SetCursor(SDL_Cursor * cursor);
 */
PHP_FUNCTION(SDL_SetCursor)
{
	zval *value = NULL;
	if (execute_data->func->common.scope && getThis()) {
		if (zend_parse_parameters_none() == FAILURE) { return; }
		value = getThis();
	} else {
		if (zend_parse_parameters(ZEND_NUM_ARGS(), "O!", &value, php_sdl_cursor_ce) == FAILURE) { return; }
	}
	if (!SDL_GetCurrentVideoDriver()) { zend_throw_error(NULL, "Initialize SDL video before selecting a cursor"); RETURN_THROWS(); }
	if (!value) { SDL_SetCursor(NULL); return; }
	SDL_Cursor *cursor = cursor_object(Z_OBJ_P(value))->cursor;
	if (!cursor) { zend_throw_error(NULL, "SDL_Cursor has been freed"); RETURN_THROWS(); }
	SDL_SetCursor(cursor);
}
/* }}} */

/* {{{ proto SDL_Cursor SDL_GetCursor(void)

 *  \brief Return the active cursor.
 extern DECLSPEC SDL_Cursor *SDLCALL SDL_GetCursor(void);
 */
PHP_FUNCTION(SDL_GetCursor)
{
	SDL_Cursor *cursor;

	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}
	if (!SDL_GetCurrentVideoDriver()) { RETURN_NULL(); }
	cursor = SDL_GetCursor();
	sdl_cursor_to_zval(cursor, return_value, SDL_DONTFREE);
}
/* }}} */

/* {{{ proto SDL_Cursor SDL_GetDefaultCursor(void)

 *  \brief Return the default cursor.
 extern DECLSPEC SDL_Cursor *SDLCALL SDL_GetDefaultCursor(void);
 */
PHP_FUNCTION(SDL_GetDefaultCursor)
{
	SDL_Cursor *cursor;

	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}
	if (!SDL_GetCurrentVideoDriver()) { RETURN_NULL(); }
	cursor = SDL_GetDefaultCursor();
	sdl_cursor_to_zval(cursor, return_value, SDL_DONTFREE);
}
/* }}} */

/* {{{ proto int SDL_ShowCursor(int toggle)

 *  \brief Toggle whether or not the cursor is shown.
 *
 *  \param toggle 1 to show the cursor, 0 to hide it, -1 to query the current
 *                state.
 *
 *  \return The previous visibility (1 or 0), or the current visibility for SDL_QUERY.
 extern DECLSPEC int SDLCALL SDL_ShowCursor(int toggle);
 */
PHP_FUNCTION(SDL_ShowCursor)
{
	zend_long toggle;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &toggle) == FAILURE) { return; }
	if (toggle < SDL_QUERY || toggle > SDL_ENABLE) {
		zend_value_error("cursor visibility must be SDL_QUERY, SDL_DISABLE or SDL_ENABLE"); RETURN_THROWS();
	}
	RETURN_LONG(SDL_ShowCursor((int)toggle));
}
/* }}} */

/* {{{ proto SDL_Window SDL_GetMouseFocus(void)

 *  \brief Get the window which currently has mouse focus.
 extern DECLSPEC SDL_Window * SDLCALL SDL_GetMouseFocus(void);
 */
PHP_FUNCTION(SDL_GetMouseFocus)
{
	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}
	sdl_window_to_zval(SDL_GetMouseFocus(), return_value, SDL_DONTFREE);
}

/* {{{ proto int SDL_GetMouseState(int &x, int &y)

 *  \brief Retrieve the current state of the mouse.
 *
 *  The current button state is returned as a button bitmask, which can
 *  be tested using the SDL_BUTTON(X) macros, and x and y are set to the
 *  mouse cursor position relative to the focus window for the currently
 *  selected mouse.  You can pass NULL for either x or y.
 extern DECLSPEC Uint32 SDLCALL SDL_GetMouseState(int *x, int *y);
 */
PHP_FUNCTION(SDL_GetMouseState)
{
	zval *z_x = NULL, *z_y = NULL;
	int x = 0, y = 0;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "|zz", &z_x, &z_y) == FAILURE) { return; }
	Uint32 state = SDL_GetMouseState(&x, &y);
	if (z_x) { ZEND_TRY_ASSIGN_REF_LONG(z_x, x); if (EG(exception)) { RETURN_THROWS(); } }
	if (z_y) { ZEND_TRY_ASSIGN_REF_LONG(z_y, y); if (EG(exception)) { RETURN_THROWS(); } }
	RETURN_LONG(state);
}
/* }}} */

/* {{{ proto int SDL_GetRelativeMouseState(int &x, int &y)

 *  \brief Retrieve the relative state of the mouse.
 *
 *  The current button state is returned as a button bitmask, which can
 *  be tested using the SDL_BUTTON(X) macros, and x and y are set to the
 *  mouse deltas since the last call to SDL_GetRelativeMouseState().
 extern DECLSPEC Uint32 SDLCALL SDL_GetRelativeMouseState(int *x, int *y);
 */
PHP_FUNCTION(SDL_GetRelativeMouseState)
{
	zval *z_x = NULL, *z_y = NULL;
	int x = 0, y = 0;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "|zz", &z_x, &z_y) == FAILURE) { return; }
	Uint32 state = SDL_GetRelativeMouseState(&x, &y);
	if (z_x) { ZEND_TRY_ASSIGN_REF_LONG(z_x, x); if (EG(exception)) { RETURN_THROWS(); } }
	if (z_y) { ZEND_TRY_ASSIGN_REF_LONG(z_y, y); if (EG(exception)) { RETURN_THROWS(); } }
	RETURN_LONG(state);
}
/* }}} */

/* {{{ proto void SDL_WarpMouseInWindow(SDL_Window window, int x, int y)

 *  \brief Moves the mouse to the given position within the window.
 *
 *  \param window The window to move the mouse into, or NULL for the current mouse focus
 *  \param x The x coordinate within the window
 *  \param y The y coordinate within the window
 *
 *  \note This function generates a mouse motion event
 extern DECLSPEC void SDLCALL SDL_WarpMouseInWindow(SDL_Window * window,
													int x, int y);
 */
PHP_FUNCTION(SDL_WarpMouseInWindow)
{
	zval *z_window = NULL;
	zend_long x, y;
	if (execute_data->func->common.scope && getThis()) {
		if (zend_parse_parameters(ZEND_NUM_ARGS(), "ll", &x, &y) == FAILURE) { return; }
		z_window = getThis();
	} else {
		if (zend_parse_parameters(ZEND_NUM_ARGS(), "O!ll", &z_window, get_php_sdl_window_ce(), &x, &y) == FAILURE) { return; }
	}
	if (x < INT_MIN || x > INT_MAX || y < INT_MIN || y > INT_MAX) {
		zend_value_error("mouse coordinates must fit signed 32-bit integers"); RETURN_THROWS();
	}
	SDL_Window *window = z_window ? zval_to_sdl_window(z_window) : NULL;
	if (z_window && !window) { zend_throw_error(NULL, "SDL_Window has been destroyed"); RETURN_THROWS(); }
	SDL_WarpMouseInWindow(window, (int)x, (int)y);
}
/* }}} */

/* {{{ proto int SDL_SetRelativeMouseMode(bool enabled)

 *  \brief Set relative mouse mode.
 *
 *  \param enabled Whether or not to enable relative mode
 *
 *  \return 0 on success, or -1 if relative mode is not supported.
 *
 *  While the mouse is in relative mode, the cursor is hidden, and the
 *  driver will try to report continuous motion in the current window.
 *  Only relative motion events will be delivered, the mouse position
 *  will not change.
 *
 *  \note This function will flush any pending mouse motion.
 *
 *  \sa SDL_GetRelativeMouseMode()
 extern DECLSPEC int SDLCALL SDL_SetRelativeMouseMode(SDL_bool enabled);
 */
PHP_FUNCTION(SDL_SetRelativeMouseMode)
{
	bool enabled;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "b", &enabled))
	{
		return;
	}
	RETVAL_LONG(SDL_SetRelativeMouseMode(enabled));
}
/* }}} */

/* {{{ proto bool SDL_GetRelativeMouseMode(void)

 *  \brief Query whether relative mouse mode is enabled.
 *
 *  \sa SDL_SetRelativeMouseMode()
extern DECLSPEC SDL_bool SDLCALL SDL_GetRelativeMouseMode(void);
 */
PHP_FUNCTION(SDL_GetRelativeMouseMode)
{
	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}
	RETVAL_BOOL(SDL_GetRelativeMouseMode());
}

ZEND_BEGIN_ARG_INFO_EX(arginfo_none, 0, 0, 0)
ZEND_END_ARG_INFO()

/* {{{ sdl_cursor_methods[] */
static const zend_function_entry php_sdl_cursor_methods[] = {
	PHP_ME(SDL_Cursor, __construct, arginfo_SDL_Cursor__construct, ZEND_ACC_CTOR | ZEND_ACC_PUBLIC)
		PHP_ME(SDL_Cursor, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)

	/* non-static methods */
	PHP_FALIAS(Free, SDL_FreeCursor, arginfo_none)
		PHP_FALIAS(Set, SDL_SetCursor, arginfo_none)

	/* static methods */
	ZEND_FENTRY(Create, ZEND_FN(SDL_CreateCursor), arginfo_SDL_Cursor__construct, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
		ZEND_FENTRY(CreateSystem, ZEND_FN(SDL_CreateSystemCursor), arginfo_SDL_CreateSystemCursor, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
			ZEND_FENTRY(CreateColor, ZEND_FN(SDL_CreateColorCursor), arginfo_SDL_CreateColorCursor, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
				ZEND_FENTRY(Get, ZEND_FN(SDL_GetCursor), arginfo_none, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
					ZEND_FENTRY(GetDefault, ZEND_FN(SDL_GetDefaultCursor), arginfo_none, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
						ZEND_FENTRY(Show, ZEND_FN(SDL_ShowCursor), arginfo_SDL_ShowCursor, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)

							ZEND_FE_END};
/* }}} */

#define REGISTER_CURSOR_CLASS_CONST_LONG(const_name, value)                                      \
	REGISTER_LONG_CONSTANT("SDL_SYSTEM_CURSOR_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_cursor_ce, ZEND_STRL(const_name), value)

/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_mouse)
{
	zend_class_entry ce;

	INIT_CLASS_ENTRY(ce, "SDL_Cursor", php_sdl_cursor_methods);
	php_sdl_cursor_ce = zend_register_internal_class(&ce);
	php_sdl_cursor_ce->create_object = php_sdl_cursor_new;
	if (php_sdl_deny_serialization(php_sdl_cursor_ce) != SUCCESS) { return FAILURE; }
	memcpy(&php_sdl_cursor_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_cursor_handlers.free_obj = php_sdl_cursor_free;
	php_sdl_cursor_handlers.clone_obj = NULL;
	php_sdl_cursor_handlers.offset = XtOffsetOf(struct php_sdl_cursor, zo);

	REGISTER_LONG_CONSTANT("SDL_DISABLE", SDL_DISABLE, CONST_CS | CONST_PERSISTENT);

	/* Cursor types for SDL_CreateSystemCursor.
	   typedef enum SDL_SystemCursor; */
	REGISTER_CURSOR_CLASS_CONST_LONG("ARROW", SDL_SYSTEM_CURSOR_ARROW);
	REGISTER_CURSOR_CLASS_CONST_LONG("IBEAM", SDL_SYSTEM_CURSOR_IBEAM);
	REGISTER_CURSOR_CLASS_CONST_LONG("WAIT", SDL_SYSTEM_CURSOR_WAIT);
	REGISTER_CURSOR_CLASS_CONST_LONG("CROSSHAIR", SDL_SYSTEM_CURSOR_CROSSHAIR);
	REGISTER_CURSOR_CLASS_CONST_LONG("WAITARROW", SDL_SYSTEM_CURSOR_WAITARROW);
	REGISTER_CURSOR_CLASS_CONST_LONG("SIZENWSE", SDL_SYSTEM_CURSOR_SIZENWSE);
	REGISTER_CURSOR_CLASS_CONST_LONG("SIZENESW", SDL_SYSTEM_CURSOR_SIZENESW);
	REGISTER_CURSOR_CLASS_CONST_LONG("SIZEWE", SDL_SYSTEM_CURSOR_SIZEWE);
	REGISTER_CURSOR_CLASS_CONST_LONG("SIZENS", SDL_SYSTEM_CURSOR_SIZENS);
	REGISTER_CURSOR_CLASS_CONST_LONG("SIZEALL", SDL_SYSTEM_CURSOR_SIZEALL);
	REGISTER_CURSOR_CLASS_CONST_LONG("NO", SDL_SYSTEM_CURSOR_NO);
	REGISTER_CURSOR_CLASS_CONST_LONG("HAND", SDL_SYSTEM_CURSOR_HAND);

	REGISTER_LONG_CONSTANT("SDL_NUM_SYSTEM_CURSORS", SDL_NUM_SYSTEM_CURSORS, CONST_CS | CONST_PERSISTENT);
	zend_declare_class_constant_long(php_sdl_cursor_ce, ZEND_STRL("NUM_SYSTEM"), SDL_NUM_SYSTEM_CURSORS);

	/*
	 *  Used as a mask when testing buttons in buttonstate.
	 *   - Button 1:  Left mouse button
	 *   - Button 2:  Middle mouse button
	 *   - Button 3:  Right mouse button
	 */
	REGISTER_LONG_CONSTANT("SDL_BUTTON_LEFT", SDL_BUTTON_LEFT, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_MIDDLE", SDL_BUTTON_MIDDLE, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_RIGHT", SDL_BUTTON_RIGHT, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_X1", SDL_BUTTON_X1, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_X2", SDL_BUTTON_X2, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_LMASK", SDL_BUTTON_LMASK, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_MMASK", SDL_BUTTON_MMASK, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_RMASK", SDL_BUTTON_RMASK, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_X1MASK", SDL_BUTTON_X1MASK, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BUTTON_X2MASK", SDL_BUTTON_X2MASK, CONST_CS | CONST_PERSISTENT);

	return SUCCESS;
}
/* }}} */
