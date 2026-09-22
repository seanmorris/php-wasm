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

#include "window.h"
#include "php_sdl_extra.h"
#include "glcontext.h"
#include "mouse.h"
#include "rect.h"
#include "shape.h"
#include "surface.h"
#include "video.h"
#include "zend_interfaces.h"
#include <limits.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/html5.h>
extern void php_sdl_fullscreen_claim(SDL_Window *window);
extern void php_sdl_fullscreen_cleanup(SDL_Window *window);
#endif

/* used to associate PHP object handle to SDL_Window */
#define PHP_SDL_MAGICDATA "__php__handle"

static zend_class_entry *php_sdl_window_ce;
static zend_object_handlers php_sdl_window_handlers;
struct php_sdl_window
{
	SDL_Window *window;
	struct php_sdl_window *next;
	int flags;
	Uint64 generation;
	zend_object zo;
};

typedef struct php_sdl_window php_sdl_window_t;

static php_sdl_window_t *windows;
static Uint64 window_generation;

void php_sdl_windows_invalidate(SDL_Window *window)
{
	php_sdl_pointer_cleanup(window);
	php_sdl_text_cleanup(window);
#ifdef __EMSCRIPTEN__
	php_sdl_fullscreen_cleanup(window);
#endif
	for (php_sdl_window_t *item = windows; item; item = item->next) {
		if (!window || item->window == window) {
			item->window = NULL;
			item->generation = ++window_generation;
		}
	}
}

static void php_sdl_window_destroy(SDL_Window *window)
{
	php_sdl_render_close(window);
	php_sdl_contexts_close(window);
	php_sdl_windows_invalidate(window);
	SDL_DestroyWindow(window);
}


static inline php_sdl_window_t *php_sdl_window_fetch_object(zend_object *obj);

zend_class_entry *get_php_sdl_window_ce(void)
{
	return php_sdl_window_ce;
}

/* {{{ zval_to_sdl_window */
SDL_Window *zval_to_sdl_window(zval *z_val)
{
	if (z_val && Z_TYPE_P(z_val) == IS_OBJECT && instanceof_function(Z_OBJCE_P(z_val), php_sdl_window_ce))
	{
		zend_object *zo = Z_OBJ_P(z_val);

		struct php_sdl_window *intern;
		intern = (struct php_sdl_window *)((char *)zo - zo->handlers->offset);
		return intern->window;
	}
	return NULL;
}
/* }}} */

/* {{{ sdl_window_read_property*/
static HashTable *sdl_window_get_properties(zend_object *object)
{
	HashTable *props = zend_std_get_properties(object);
	php_sdl_window_t *intern = php_sdl_window_fetch_object(object);
	if (!intern->window) { return props; }
	/* Snapshot all native values before replacing PHP properties: a property
	 * destructor may close/recreate this window while the assignments run. */
	int w, h, x, y;
	SDL_GetWindowSize(intern->window, &w, &h);
	SDL_GetWindowPosition(intern->window, &x, &y);
	Uint32 id = SDL_GetWindowID(intern->window), flags = SDL_GetWindowFlags(intern->window);
	zend_string *title = zend_string_init(SDL_GetWindowTitle(intern->window), strlen(SDL_GetWindowTitle(intern->window)), 0);
#define WINDOW_PROPERTY(name, value) \
	zend_update_property_long(php_sdl_window_ce, object, ZEND_STRL(name), value); \
	if (EG(exception)) { goto properties_done; }
	WINDOW_PROPERTY("id", id);
	WINDOW_PROPERTY("flags", flags);
	WINDOW_PROPERTY("x", x);
	WINDOW_PROPERTY("y", y);
	WINDOW_PROPERTY("w", w);
	WINDOW_PROPERTY("h", h);
#undef WINDOW_PROPERTY
	zend_update_property_str(php_sdl_window_ce, object, ZEND_STRL("title"), title);
properties_done:
	zend_string_release(title);
	return props;
}
/* }}} */

/* GC must only report references. Refreshing native properties here can run
 * PHP destructors or mutate the graph while Zend is collecting it. */
static HashTable *sdl_window_get_gc(zend_object *object, zval **table, int *count)
{
	if (object->properties) {
		*table = NULL;
		*count = 0;
#if PHP_VERSION_ID < 80100
		/* Preserve PHP 8.0's standard separation of shared property tables. */
		if (GC_REFCOUNT(object->properties) > 1 && !(GC_FLAGS(object->properties) & IS_ARRAY_IMMUTABLE)) {
			GC_DELREF(object->properties);
			object->properties = zend_array_dup(object->properties);
		}
#endif
		return object->properties;
	}
	*table = object->properties_table;
	*count = object->ce->default_properties_count;
	return NULL;
}

static inline php_sdl_window_t *php_sdl_window_fetch_object(zend_object *obj)
{
	return (php_sdl_window_t *)((char *)obj - XtOffsetOf(php_sdl_window_t, zo));
}

#define FETCH_WINDOW(pointer, value, check) \
	intern = php_sdl_window_fetch_object(Z_OBJ_P(value)); \
	pointer = intern->window; \
	if ((check) && !pointer) { \
		zend_throw_error(NULL, "SDL_Window has been destroyed or was not initialized"); \
		RETURN_THROWS(); \
	}

static zend_bool window_current(php_sdl_window_t *intern, Uint64 generation)
{
	if (EG(exception)) { return 0; }
	if (!intern->window || intern->generation != generation) {
		zend_throw_error(NULL, "SDL_Window changed during a PHP callback");
		return 0;
	}
	return 1;
}

static zend_bool window_title(const char *title, size_t length)
{
	if (memchr(title, '\0', length)) {
		zend_value_error("window title must not contain null bytes");
		return 0;
	}
	return 1;
}

static zend_bool window_assign(php_sdl_window_t *intern, SDL_Window *window, int flags)
{
	intern->window = window;
	intern->flags = flags;
	intern->generation = ++window_generation;
	Uint64 assigned_generation = intern->generation;
#ifdef __EMSCRIPTEN__
	if (window && (SDL_GetWindowFlags(window) & SDL_WINDOW_FULLSCREEN)) { php_sdl_fullscreen_claim(window); }
#endif
	/* Focusing the editing surface can run a PHP DOM handler synchronously.
	 * It may destroy or replace this window; never reuse its raw pointer. */
	php_sdl_pointer_window(window);
	php_sdl_text_window(window);
	return window_current(intern, assigned_generation);
}

static zend_bool window_displaymode(zval *value, SDL_DisplayMode *mode)
{
	const char *names[] = {"format", "w", "h", "refresh_rate"};
	zend_long values[4];
	zval object;
	ZVAL_COPY(&object, value);
	SDL_zero(*mode);
	for (int i = 0; i < 4; i++) {
		zval temporary;
		ZVAL_UNDEF(&temporary);
		zval *property = zend_read_property(get_php_sdl_displaymode_ce(), Z_OBJ(object), names[i], strlen(names[i]), 0, &temporary);
		if (!EG(exception)) {
			ZVAL_DEREF(property);
			if (Z_TYPE_P(property) != IS_LONG || Z_LVAL_P(property) < INT_MIN || Z_LVAL_P(property) > INT_MAX) {
				zend_type_error("SDL_DisplayMode::%s must be a native integer", names[i]);
			} else { values[i] = Z_LVAL_P(property); }
		}
		zval_ptr_dtor(&temporary);
		if (EG(exception)) { zval_ptr_dtor(&object); return 0; }
	}
	zval_ptr_dtor(&object);
	if (EG(exception)) { return 0; }
	mode->format = (Uint32)values[0];
	mode->w = (int)values[1];
	mode->h = (int)values[2];
	mode->refresh_rate = (int)values[3];
	return 1;
}

/* {{{ proto void SDL_GetWindowDisplayIndex(SDL_Window window)

 *  \brief Get the display index associated with a window.
 *
 *  \return the display index of the display containing the center of the
 *          window, or -1 on error.
 extern DECLSPEC int SDLCALL SDL_GetWindowDisplayIndex(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowDisplayIndex)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	RETURN_LONG(SDL_GetWindowDisplayIndex(window));
}
/* }}} */

/* {{{ proto int SDL_SetWindowDisplayMode(SDL_Window window, SDL_DisplayMode mode)

 *  \brief Set the display mode used when a fullscreen window is visible.
 *
 *  By default the window's dimensions and the desktop format and refresh rate
 *  are used.
 *
 *  \param window The window for which the display mode should be set.
 *  \param mode The mode to use, or NULL for the default mode.
 *
 *  \return 0 on success, or -1 if setting the display mode failed.
 *
 *  \sa SDL_GetWindowDisplayMode()
 *  \sa SDL_SetWindowFullscreen()
 extern DECLSPEC int SDLCALL SDL_SetWindowDisplayMode(SDL_Window * window,
													  const SDL_DisplayMode
														  * mode);
 */
PHP_FUNCTION(SDL_SetWindowDisplayMode)
{
	php_sdl_window_t *intern;
	zval *z_window, *z_mode;
	SDL_Window *window;
	SDL_DisplayMode mode;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO!", &z_window, php_sdl_window_ce, &z_mode, get_php_sdl_displaymode_ce()) == FAILURE) { RETURN_THROWS(); }
	FETCH_WINDOW(window, z_window, 1);
	Uint64 generation = intern->generation;
	if (z_mode && !window_displaymode(z_mode, &mode)) { RETURN_THROWS(); }
	if (!window_current(intern, generation)) { RETURN_THROWS(); }
	RETURN_LONG(SDL_SetWindowDisplayMode(window, z_mode ? &mode : NULL));
}
/* }}} */

/* {{{ proto int SDL_GetWindowDisplayMode(SDL_Window window, SDL_DisplayMode mode)

 *  \brief Fill in information about the display mode used when a fullscreen
 *         window is visible.
 *
 *  \sa SDL_SetWindowDisplayMode()
 *  \sa SDL_SetWindowFullscreen()
 extern DECLSPEC int SDLCALL SDL_GetWindowDisplayMode(SDL_Window * window,
													  SDL_DisplayMode * mode);
 */
PHP_FUNCTION(SDL_GetWindowDisplayMode)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_mode;
	SDL_Window *window;
	SDL_DisplayMode mode;
	int res;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oz", &z_window, php_sdl_window_ce, &z_mode) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	res = SDL_GetWindowDisplayMode(window, &mode);
	if (0 == res)
	{
		zval result;
		sdl_displaymode_to_zval(&mode, &result);
		ZEND_TRY_ASSIGN_REF_COPY(z_mode, &result);
		zval_ptr_dtor(&result);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETVAL_LONG(res);
}
/* }}} */

/* {{{ proto int SDL_GetWindowPixelFormat(SDL_Window window)

 *  \brief Get the pixel format associated with the window.
 extern DECLSPEC Uint32 SDLCALL SDL_GetWindowPixelFormat(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowPixelFormat)
{
	struct php_sdl_window *intern;
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, php_sdl_window_ce))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETVAL_LONG(SDL_GetWindowPixelFormat(window));
}
/* }}} */

/* {{{ proto int SDL_GetWindowID(SDL_Window window)

 *  \brief Get the numeric ID of a window, for logging purposes.
 extern DECLSPEC Uint32 SDLCALL SDL_GetWindowID(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowID)
{
	struct php_sdl_window *intern;
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, php_sdl_window_ce))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETVAL_LONG(SDL_GetWindowID(window));
}
/* }}} */

/* {{{ proto int SDL_GetWindowFlags(SDL_Window window)

 *  \brief Get the window flags.
 extern DECLSPEC Uint32 SDLCALL SDL_GetWindowFlags(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowFlags)
{
	struct php_sdl_window *intern;
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, php_sdl_window_ce))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETVAL_LONG(SDL_GetWindowFlags(window));
}
/* }}} */

/* {{{ proto void SDL_SetWindowIcon(SDL_Window window, SDL_Surface icon)

 *  \brief Set the icon for a window.
 *
 *  \param window The window for which the icon should be set.
 *  \param icon The icon for the window.
 extern DECLSPEC void SDLCALL SDL_SetWindowIcon(SDL_Window * window,
												SDL_Surface * icon);
 */
PHP_FUNCTION(SDL_SetWindowIcon)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_icon;
	SDL_Window *window;
	SDL_Surface *icon;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO", &z_window, php_sdl_window_ce, &z_icon, get_php_sdl_surface_ce()))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	icon = zval_to_sdl_surface(z_icon);

	if (icon)
	{
		SDL_SetWindowIcon(window, icon);
	}
	else
	{
		php_error_docref(NULL, E_WARNING, "Invalid SDL_Surface object");
	}
}
/* }}} */

/* {{{ proto void SDL_SetWindowPosition(SDL Window window, int x, int y)

 *  \brief Set the position of a window.
 *
 *  \param window   The window to reposition.
 *  \param x        The x coordinate of the window, ::SDL_WINDOWPOS_CENTERED, or
					::SDL_WINDOWPOS_UNDEFINED.
 *  \param y        The y coordinate of the window, ::SDL_WINDOWPOS_CENTERED, or
					::SDL_WINDOWPOS_UNDEFINED.
 *
 *  \note The window coordinate origin is the upper left of the display.
 *
 *  \sa SDL_GetWindowPosition()
 extern DECLSPEC void SDLCALL SDL_SetWindowPosition(SDL_Window * window,
													int x, int y);
 */
PHP_FUNCTION(SDL_SetWindowPosition)
{
	struct php_sdl_window *intern;
	zval *z_window;
	zend_long x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oll", &z_window, php_sdl_window_ce, &x, &y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_SetWindowPosition(window, x, y);
}
/* }}} */

/* {{{ proto int SDL_WINDOWPOS_CENTERED_DISPLAY(int)

 define SDL_WINDOWPOS_CENTERED_DISPLAY(X)  (SDL_WINDOWPOS_CENTERED_MASK|(X))
*/
PHP_FUNCTION(SDL_WINDOWPOS_CENTERED_DISPLAY)
{
	zend_long display;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "l", &display))
	{
		return;
	}
	RETVAL_LONG(SDL_WINDOWPOS_CENTERED_DISPLAY(display));
}
/* }}} */

/* {{{ proto int SDL_WINDOWPOS_UNDEFINED_DISPLAY(int)

 define SDL_WINDOWPOS_UNDEFINED_DISPLAY(X)  (SDL_WINDOWPOS_UNDEFINED_MASK|(X))
*/
PHP_FUNCTION(SDL_WINDOWPOS_UNDEFINED_DISPLAY)
{
	zend_long display;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "l", &display))
	{
		return;
	}
	RETVAL_LONG(SDL_WINDOWPOS_UNDEFINED_DISPLAY(display));
}
/* }}} */

/* {{{ proto void SDL_GetWindowPosition(SDL Window window, int &x, int &y)

 *  \brief Get the position of a window.
 *
 *  \param window   The window to query.
 *  \param x        Pointer to variable for storing the x position, may be NULL
 *  \param y        Pointer to variable for storing the y position, may be NULL
 *
 *  \sa SDL_SetWindowPosition()
 extern DECLSPEC void SDLCALL SDL_GetWindowPosition(SDL_Window * window,
													int *x, int *y);
 */
PHP_FUNCTION(SDL_GetWindowPosition)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_x = NULL, *z_y = NULL;
	int x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O|zz", &z_window, php_sdl_window_ce, &z_x, &z_y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_GetWindowPosition(window, &x, &y);
	if (z_x)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_x, x);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	if (z_y)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_y, y);
		if (EG(exception)) { RETURN_THROWS(); }
	}
}
/* }}} */

/* {{{ proto void SDL_SetWindowSize(SDL Window window, int x, int y)

 *  \brief Set the size of a window's client area.
 *
 *  \param window   The window to resize.
 *  \param w        The width of the window, must be >0
 *  \param h        The height of the window, must be >0
 *
 *  \note You can't change the size of a fullscreen window, it automatically
 *        matches the size of the display mode.
 *
 *  \sa SDL_GetWindowSize()
 extern DECLSPEC void SDLCALL SDL_SetWindowSize(SDL_Window * window, int w,
												int h);
 */
PHP_FUNCTION(SDL_SetWindowSize)
{
	struct php_sdl_window *intern;
	zval *z_window;
	zend_long x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oll", &z_window, php_sdl_window_ce, &x, &y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_SetWindowSize(window, x, y);
}
/* }}} */

/* {{{ proto void SDL_GetWindowSize(SDL Window window, int &x, int &y)

 *  \brief Get the size of a window's client area.
 *
 *  \param window   The window to query.
 *  \param w        Pointer to variable for storing the width, may be NULL
 *  \param h        Pointer to variable for storing the height, may be NULL
 *
 *  \sa SDL_SetWindowSize()
 extern DECLSPEC void SDLCALL SDL_GetWindowSize(SDL_Window * window, int *w,
												int *h);
 */
PHP_FUNCTION(SDL_GetWindowSize)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_x = NULL, *z_y = NULL;
	int x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O|zz", &z_window, php_sdl_window_ce, &z_x, &z_y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_GetWindowSize(window, &x, &y);
	if (z_x)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_x, x);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	if (z_y)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_y, y);
		if (EG(exception)) { RETURN_THROWS(); }
	}
}
/* }}} */

/* {{{ proto void SDL_SetWindowMinimumSize(SDL Window window, int x, int y)

 *  \brief Set the minimum size of a window's client area.
 *
 *  \param window    The window to set a new minimum size.
 *  \param min_w     The minimum width of the window, must be >0
 *  \param min_h     The minimum height of the window, must be >0
 *
 *  \note You can't change the minimum size of a fullscreen window, it
 *        automatically matches the size of the display mode.
 *
 *  \sa SDL_GetWindowMinimumSize()
 *  \sa SDL_SetWindowMaximumSize()
 extern DECLSPEC void SDLCALL SDL_SetWindowMinimumSize(SDL_Window * window,
													   int min_w, int min_h);
 */
PHP_FUNCTION(SDL_SetWindowMinimumSize)
{
	struct php_sdl_window *intern;
	zval *z_window;
	zend_long x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oll", &z_window, php_sdl_window_ce, &x, &y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_SetWindowMinimumSize(window, x, y);
}
/* }}} */

/* {{{ proto void SDL_GetWindowMinimumSize(SDL Window window, int &x, int &y)

 *  \brief Get the minimum size of a window's client area.
 *
 *  \param window   The window to query.
 *  \param w        Pointer to variable for storing the minimum width, may be NULL
 *  \param h        Pointer to variable for storing the minimum height, may be NULL
 *
 *  \sa SDL_GetWindowMaximumSize()
 *  \sa SDL_SetWindowMinimumSize()
 extern DECLSPEC void SDLCALL SDL_GetWindowMinimumSize(SDL_Window * window,
													   int *w, int *h);
 */
PHP_FUNCTION(SDL_GetWindowMinimumSize)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_x = NULL, *z_y = NULL;
	int x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O|zz", &z_window, php_sdl_window_ce, &z_x, &z_y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_GetWindowMinimumSize(window, &x, &y);
	if (z_x)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_x, x);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	if (z_y)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_y, y);
		if (EG(exception)) { RETURN_THROWS(); }
	}
}
/* }}} */

/* {{{ proto void SDL_SetWindowMaximumSize(SDL Window window, int x, int y)

 *  \brief Set the maximum size of a window's client area.
 *
 *  \param window    The window to set a new maximum size.
 *  \param max_w     The maximum width of the window, must be >0
 *  \param max_h     The maximum height of the window, must be >0
 *
 *  \note You can't change the maximum size of a fullscreen window, it
 *        automatically matches the size of the display mode.
 *
 *  \sa SDL_GetWindowMaximumSize()
 *  \sa SDL_SetWindowMinimumSize()
 extern DECLSPEC void SDLCALL SDL_SetWindowMaximumSize(SDL_Window * window,
													   int max_w, int max_h);
 */
PHP_FUNCTION(SDL_SetWindowMaximumSize)
{
	struct php_sdl_window *intern;
	zval *z_window;
	zend_long x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oll", &z_window, php_sdl_window_ce, &x, &y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_SetWindowMaximumSize(window, x, y);
}
/* }}} */

/* {{{ proto void SDL_GetWindowMaximumSize(SDL Window window, int &x, int &y)

 *  \brief Get the maximum size of a window's client area.
 *
 *  \param window   The window to query.
 *  \param w        Pointer to variable for storing the maximum width, may be NULL
 *  \param h        Pointer to variable for storing the maximum height, may be NULL
 *
 *  \sa SDL_GetWindowMinimumSize()
 *  \sa SDL_SetWindowMaximumSize()
 extern DECLSPEC void SDLCALL SDL_GetWindowMaximumSize(SDL_Window * window,
													   int *w, int *h);
 */
PHP_FUNCTION(SDL_GetWindowMaximumSize)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_x = NULL, *z_y = NULL;
	int x, y;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O|zz", &z_window, php_sdl_window_ce, &z_x, &z_y))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_GetWindowMaximumSize(window, &x, &y);
	if (z_x)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_x, x);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	if (z_y)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_y, y);
		if (EG(exception)) { RETURN_THROWS(); }
	}
}
/* }}} */

/* {{{ proto void SDL_SetWindowBordered(SDL Window window, bool bordered)

 *  \brief Set the border state of a window.
 *
 *  This will add or remove the window's SDL_WINDOW_BORDERLESS flag and
 *  add or remove the border from the actual window. This is a no-op if the
 *  window's border already matches the requested state.
 *
 *  \param window The window of which to change the border state.
 *  \param bordered SDL_FALSE to remove border, SDL_TRUE to add border.
 *
 *  \note You can't change the border state of a fullscreen window.
 *
 *  \sa SDL_GetWindowFlags()
 extern DECLSPEC void SDLCALL SDL_SetWindowBordered(SDL_Window * window,
													SDL_bool bordered);
 */
PHP_FUNCTION(SDL_SetWindowBordered)
{
	struct php_sdl_window *intern;
	zval *z_window;
	bool bordered;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ob", &z_window, php_sdl_window_ce, &bordered))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_SetWindowBordered(window, (bordered ? SDL_TRUE : SDL_FALSE));
}
/* }}} */

/* {{{ proto void SDL_ShowWindow(SDL_Window window)

 *  \brief Show a window.
 *
 *  \sa SDL_HideWindow()
 extern DECLSPEC void SDLCALL SDL_ShowWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_ShowWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	SDL_ShowWindow(window);
}
/* }}} */

/* {{{ proto void SDL_HideWindow(SDL_Window window)

 *  \brief Hide a window.
 *
 *  \sa SDL_ShowWindow()
 extern DECLSPEC void SDLCALL SDL_HideWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_HideWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	SDL_HideWindow(window);
}
/* }}} */

/* {{{ proto void SDL_RaiseWindow(SDL_Window window)

 *  \brief Raise a window above other windows and set the input focus.
 extern DECLSPEC void SDLCALL SDL_RaiseWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_RaiseWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	SDL_RaiseWindow(window);
}
/* }}} */

/* {{{ proto void SDL_MaximizeWindow(SDL_Window window)

 *  \brief Make a window as large as possible.
 *
 *  \sa SDL_RestoreWindow()
 extern DECLSPEC void SDLCALL SDL_MaximizeWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_MaximizeWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	SDL_MaximizeWindow(window);
}
/* }}} */

/* {{{ proto void SDL_MinimizeWindow(SDL_Window window)

 *  \brief Minimize a window to an iconic representation.
 *
 *  \sa SDL_RestoreWindow()
 extern DECLSPEC void SDLCALL SDL_MinimizeWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_MinimizeWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	SDL_MinimizeWindow(window);
}
/* }}} */

/* {{{ proto void SDL_RestoreWindow(SDL_Window window)

 *  \brief Restore the size and position of a minimized or maximized window.
 *
 *  \sa SDL_MaximizeWindow()
 *  \sa SDL_MinimizeWindow()
 extern DECLSPEC void SDLCALL SDL_RestoreWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_RestoreWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	SDL_RestoreWindow(window);
}
/* }}} */

/* {{{ proto int SDL_SetWindowFullscreen(SDL_Window window, int flags)

 *  \brief Set a window's fullscreen state.
 *
 *  \return 0 on success, or -1 if setting the display mode failed.
 *
 *  \sa SDL_SetWindowDisplayMode()
 *  \sa SDL_GetWindowDisplayMode()
 extern DECLSPEC int SDLCALL SDL_SetWindowFullscreen(SDL_Window * window,
													 Uint32 flags);
 */
PHP_FUNCTION(SDL_SetWindowFullscreen)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;
	zend_long flags;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &object, php_sdl_window_ce, &flags) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	/* SDL's browser driver has a void fullscreen callback, so its failure
	 * cannot reach SDL_SetWindowFullscreen's result. Reject unavailable or
	 * policy-blocked requests before the native flags are changed. A supported
	 * request may still be deferred until a gesture by the browser backend. */
#ifdef __EMSCRIPTEN__
	if (flags & SDL_WINDOW_FULLSCREEN) {
		EmscriptenFullscreenChangeEvent status = {0};
		if (emscripten_get_fullscreen_status(&status) != EMSCRIPTEN_RESULT_SUCCESS || !status.fullscreenEnabled) {
			RETURN_LONG(SDL_SetError("Browser fullscreen is unavailable or blocked by policy"));
		}
		php_sdl_fullscreen_claim(window);
	}
#endif
	RETVAL_LONG(SDL_SetWindowFullscreen(window, (Uint32)flags));
}
/* }}} */

/* {{{ proto void SDL_GetWindowSurface(SDL_Window window)

 *  \brief Get the SDL surface associated with the window.
 *
 *  \return The window's framebuffer surface, or NULL on error.
 *
 *  A new surface will be created with the optimal format for the window,
 *  if necessary. This surface will be freed when the window is destroyed.
 *
 *  \note You may not combine this with 3D or the rendering API on this window.
 *
 *  \sa SDL_UpdateWindowSurface()
 *  \sa SDL_UpdateWindowSurfaceRects()
 extern DECLSPEC SDL_Surface * SDLCALL SDL_GetWindowSurface(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowSurface)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window = NULL;
	SDL_Surface *surface = NULL;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	surface = SDL_GetWindowSurface(intern->window);
	sdl_surface_to_zval(surface, return_value);
}
/* }}} */

/* {{{ proto int SDL_UpdateWindowSurfaceRects(SDL Window window, array rects [, int numrect])

 *  \brief Copy a number of rectangles on the window surface to the screen.
 *
 *  \return 0 on success, or -1 on error.
 *
 *  \sa SDL_GetWindowSurface()
 *  \sa SDL_UpdateWindowSurfaceRect()
 extern DECLSPEC int SDLCALL SDL_UpdateWindowSurfaceRects(SDL_Window * window,
														  const SDL_Rect * rects,
														  int numrects);
 */
PHP_FUNCTION(SDL_UpdateWindowSurfaceRects)
{
	php_sdl_window_t *intern;
	zval *z_window, *array;
	zend_long count = 0;
	SDL_Window *window;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oa|l", &z_window, php_sdl_window_ce, &array, &count) == FAILURE) { RETURN_THROWS(); }
	FETCH_WINDOW(window, z_window, 1);
	Uint64 generation = intern->generation;
	if (ZEND_NUM_ARGS() < (getThis() ? 2 : 3)) { count = zend_hash_num_elements(Z_ARRVAL_P(array)); }
	if (count < 0 || (uint64_t)count > zend_hash_num_elements(Z_ARRVAL_P(array)) || (uint64_t)count > INT_MAX / sizeof(SDL_Rect)) {
		zend_value_error("rectangle count must fit the supplied array and native buffer"); RETURN_THROWS();
	}
	if (!count) { RETURN_LONG(0); }
	SDL_Rect *rects = safe_emalloc(count, sizeof(*rects), 0);
	/* A getter may mutate the caller's array. Retain a stable list of values
	 * until the native call has finished, then allow cleanup to run PHP. */
	HashTable *snapshot = zend_array_dup(Z_ARRVAL_P(array));
	zval *value;
	int index = 0;
	ZEND_HASH_FOREACH_VAL(snapshot, value) {
		if (index == count) { break; }
		if (!php_sdl_read_rect(value, &rects[index++]) || !window_current(intern, generation)) { goto rects_done; }
	} ZEND_HASH_FOREACH_END();
	RETVAL_LONG(SDL_UpdateWindowSurfaceRects(window, rects, index));
rects_done:
	efree(rects);
	zend_array_destroy(snapshot);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

/* {{{ proto void SDL_SetWindowGrab(SDL Window window, bool grabbed)

 *  \brief Set a window's input grab mode.
 *
 *  \param window The window for which the input grab mode should be set.
 *  \param grabbed This is SDL_TRUE to grab input, and SDL_FALSE to release input.
 *
 *  \sa SDL_GetWindowGrab()
 extern DECLSPEC void SDLCALL SDL_SetWindowGrab(SDL_Window * window,
												SDL_bool grabbed);
 */
PHP_FUNCTION(SDL_SetWindowGrab)
{
	struct php_sdl_window *intern;
	zval *z_window;
	bool grabbed;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ob", &z_window, php_sdl_window_ce, &grabbed))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	SDL_SetWindowGrab(window, (grabbed ? SDL_TRUE : SDL_FALSE));
}
/* }}} */

/* {{{ proto bool SDL_GetWindowGrab(SDL Window window)

 *  \brief Get a window's input grab mode.
 *
 *  \return This returns SDL_TRUE if input is grabbed, and SDL_FALSE otherwise.
 *
 *  \sa SDL_SetWindowGrab()
 extern DECLSPEC SDL_bool SDLCALL SDL_GetWindowGrab(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowGrab)
{
	struct php_sdl_window *intern;
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, php_sdl_window_ce))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETVAL_BOOL(SDL_GetWindowGrab(window));
}
/* }}} */

/* {{{ proto int SDL_SetWindowBrightness(SDL Window window, float brightness)

 *  \brief Set the brightness (gamma correction) for a window.
 *
 *  \return 0 on success, or -1 if setting the brightness isn't supported.
 *
 *  \sa SDL_GetWindowBrightness()
 extern DECLSPEC int SDLCALL SDL_SetWindowBrightness(SDL_Window * window, float brightness);
 */
PHP_FUNCTION(SDL_SetWindowBrightness)
{
	struct php_sdl_window *intern;
	zval *z_window;
	double brightness;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Od", &z_window, php_sdl_window_ce, &brightness))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETVAL_LONG(SDL_SetWindowBrightness(window, (float)brightness));
}
/* }}} */

/* {{{ proto void SDL_GetWindowBrightness(SDL Window window)

 *  \brief Get the brightness (gamma correction) for a window.
 *
 *  \return The last brightness value passed to SDL_SetWindowBrightness()
 *
 *  \sa SDL_SetWindowBrightness()
 extern DECLSPEC float SDLCALL SDL_GetWindowBrightness(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowBrightness)
{
	struct php_sdl_window *intern;
	zval *z_window;
	SDL_Window *window;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, php_sdl_window_ce))
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETVAL_DOUBLE(SDL_GetWindowBrightness(window));
}
/* }}} */

/* {{{ proto int SDL_GetWindowGammaRamp(SDL Window window, array &red, array &green, array &blue)

 *  \brief Get the gamma ramp for a window.
 *
 *  \param window The window from which the gamma ramp should be queried.
 *  \param red   A pointer to a 256 element array of 16-bit quantities to hold
 *               the translation table for the red channel, or NULL.
 *  \param green A pointer to a 256 element array of 16-bit quantities to hold
 *               the translation table for the green channel, or NULL.
 *  \param blue  A pointer to a 256 element array of 16-bit quantities to hold
 *               the translation table for the blue channel, or NULL.
 *
 *  \return 0 on success, or -1 if gamma ramps are unsupported.
 *
 extern DECLSPEC int SDLCALL SDL_GetWindowGammaRamp(SDL_Window * window,
													Uint16 * red,
													Uint16 * green,
													Uint16 * blue);
 */
PHP_FUNCTION(SDL_GetWindowGammaRamp)
{
	php_sdl_window_t *intern;
	zval *z_window, *outputs[3];
	SDL_Window *window;
	Uint16 ramp[3][256];
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ozzz", &z_window, php_sdl_window_ce, &outputs[0], &outputs[1], &outputs[2]) == FAILURE) { RETURN_THROWS(); }
	FETCH_WINDOW(window, z_window, 1);
	int result = SDL_GetWindowGammaRamp(window, ramp[0], ramp[1], ramp[2]);
	if (!result) {
		for (int channel = 0; channel < 3; channel++) {
			zval values;
			array_init_size(&values, 256);
			for (int i = 0; i < 256; i++) { add_next_index_long(&values, ramp[channel][i]); }
			ZEND_TRY_ASSIGN_REF_COPY(outputs[channel], &values);
			zval_ptr_dtor(&values);
			if (EG(exception)) { RETURN_THROWS(); }
		}
	}
	RETURN_LONG(result);
}
/* }}} */

static void php_create_window(INTERNAL_FUNCTION_PARAMETERS, int opt)
{
	struct php_sdl_window *intern;
	zend_long x, y, w, h, flags;
	char *title;
	size_t title_len;
	SDL_Window *window;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "slllll", &title, &title_len, &x, &y, &w, &h, &flags))
	{
		return;
	}
	if (!window_title(title, title_len)) { RETURN_THROWS(); }
	switch (opt)
	{
	case 1:
		window = SDL_CreateShapedWindow(title, x, y, w, h, flags);
		break;
	default:
		window = SDL_CreateWindow(title, x, y, w, h, flags);
	}
	if (window)
	{
		object_init_ex(return_value, php_sdl_window_ce);
		intern = php_sdl_window_fetch_object(Z_OBJ_P(return_value));
		SDL_SetWindowData(window, PHP_SDL_MAGICDATA, (void *)(unsigned long)Z_OBJ_HANDLE_P(return_value));
		if (!window_assign(intern, window, 0)) { RETURN_THROWS(); }
	}
}
/* {{{ proto SDL_Window SDL_CreateShapedWindow(string title, int x, int y, int w, int h, int flags)

 *  \brief Create a window that can be shaped with the specified position, dimensions, and flags.
 *
 *  \param title The title of the window, in UTF-8 encoding.
 *  \param x     The x position of the window, ::SDL_WINDOWPOS_CENTERED, or
 *               ::SDL_WINDOWPOS_UNDEFINED.
 *  \param y     The y position of the window, ::SDL_WINDOWPOS_CENTERED, or
 *               ::SDL_WINDOWPOS_UNDEFINED.
 *  \param w     The width of the window.
 *  \param h     The height of the window.
 *  \param flags The flags for the window, a mask of SDL_WINDOW_BORDERLESS with any of the following:
 *               ::SDL_WINDOW_OPENGL,     ::SDL_WINDOW_INPUT_GRABBED,
 *               ::SDL_WINDOW_HIDDEN,     ::SDL_WINDOW_RESIZABLE,
 *               ::SDL_WINDOW_MAXIMIZED,  ::SDL_WINDOW_MINIMIZED,
 *       ::SDL_WINDOW_BORDERLESS is always set, and ::SDL_WINDOW_FULLSCREEN is always unset.
 *
 *  \return The window created, or NULL if window creation failed.
 *
 *  \sa SDL_DestroyWindow()
 extern DECLSPEC SDL_Window * SDLCALL SDL_CreateShapedWindow(const char *title,unsigned int x,unsigned int y,unsigned int w,unsigned int h,Uint32 flags);
*/
PHP_FUNCTION(SDL_CreateShapedWindow)
{
	php_create_window(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1);
}
/* }}} */

/* {{{ proto SDL_Window SDL_CreateWindow(string title, int x, int y, int w, int h, int flags)

 *  \brief Create a window with the specified position, dimensions, and flags.
 *
 *  \param title The title of the window, in UTF-8 encoding.
 *  \param x     The x position of the window, ::SDL_WINDOWPOS_CENTERED, or
 *               ::SDL_WINDOWPOS_UNDEFINED.
 *  \param y     The y position of the window, ::SDL_WINDOWPOS_CENTERED, or
 *               ::SDL_WINDOWPOS_UNDEFINED.
 *  \param w     The width of the window.
 *  \param h     The height of the window.
 *  \param flags The flags for the window, a mask of any of the following:
 *               ::SDL_WINDOW_FULLSCREEN,    ::SDL_WINDOW_OPENGL,
 *               ::SDL_WINDOW_HIDDEN,        ::SDL_WINDOW_BORDERLESS,
 *               ::SDL_WINDOW_RESIZABLE,     ::SDL_WINDOW_MAXIMIZED,
 *               ::SDL_WINDOW_MINIMIZED,     ::SDL_WINDOW_INPUT_GRABBED,
 *               ::SDL_WINDOW_ALLOW_HIGHDPI.
 *
 *  \return The id of the window created, or zero if window creation failed.
 *
 *  \sa SDL_DestroyWindow()
 extern DECLSPEC SDL_Window * SDLCALL SDL_CreateWindow(const char *title,
													   int x, int y, int w,
													   int h, Uint32 flags);
*/
PHP_FUNCTION(SDL_CreateWindow)
{
	php_create_window(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0);
}
/* }}} */

/* {{{ proto SDL_Window::__construct(string title, int x, int y, int w, int h, int flags) */
static PHP_METHOD(SDL_Window, __construct)
{
	php_sdl_window_t *intern = php_sdl_window_fetch_object(Z_OBJ_P(getThis()));
	if (intern->window) { zend_throw_error(NULL, "SDL_Window is already initialized"); RETURN_THROWS(); }
	zend_long x, y, w, h, flags;
	char *title; size_t length;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "slllll", &title, &length, &x, &y, &w, &h, &flags) == FAILURE) { RETURN_THROWS(); }
	/* String coercion may reenter the constructor. Keep that native owner. */
	if (intern->window) { zend_throw_error(NULL, "SDL_Window was initialized during a PHP callback"); RETURN_THROWS(); }
	if (!window_title(title, length)) { RETURN_THROWS(); }
	SDL_Window *window = SDL_CreateWindow(title, x, y, w, h, flags);
	if (!window) { zend_throw_exception(zend_ce_exception, SDL_GetError(), 0); RETURN_THROWS(); }
	SDL_SetWindowData(window, PHP_SDL_MAGICDATA, (void *)(uintptr_t)Z_OBJ_HANDLE_P(getThis()));
	if (!window_assign(intern, window, 0)) { RETURN_THROWS(); }
}
/* }}} */

/* {{{ proto SDL_Window::__toString() */
static PHP_METHOD(SDL_Window, __toString)
{
	struct php_sdl_window *intern;
	char *buf = NULL;
	int buf_len;

	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}

	intern = php_sdl_window_fetch_object(Z_OBJ_P(getThis()));
	if (0 && intern->window)
	{
		int x, y, w, h;

		SDL_GetWindowPosition(intern->window, &x, &y);
		SDL_GetWindowSize(intern->window, &w, &h);
		buf_len = spprintf(&buf, 0, "SDL_Window(\"%s\",%d,%d,%d,%d,%u)", SDL_GetWindowTitle(intern->window), x, y, w, h, SDL_GetWindowFlags(intern->window));
		RETURN_STRINGL(buf, buf_len);
	}
	else
	{
		RETURN_STRING("SDL_Window()");
	}
}
/* }}} */

/* {{{ proto SDL_UpdateWindowSurface(SDL_Window window)

 *  \brief Copy the window surface to the screen.
 *
 *  \return 0 on success, or -1 on error.
 *
 *  \sa SDL_GetWindowSurface()
 *  \sa SDL_UpdateWindowSurfaceRects()
 extern DECLSPEC int SDLCALL SDL_UpdateWindowSurface(SDL_Window * window);
 */
PHP_FUNCTION(SDL_UpdateWindowSurface)
{
	struct php_sdl_window *intern;
	zval *z_window;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_window, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	RETURN_LONG(SDL_UpdateWindowSurface(window));
}
/* }}} */

/* {{{ proto SDL_DestroyWindow(SDL_Window window)

 *  \brief Destroy a window.
 extern DECLSPEC void SDLCALL SDL_DestroyWindow(SDL_Window * window);
 */
PHP_FUNCTION(SDL_DestroyWindow)
{
	php_sdl_window_t *intern;
	zval *value;
	SDL_Window *window;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_window_ce) == FAILURE) { RETURN_THROWS(); }
	FETCH_WINDOW(window, value, 0);
	if (window) { php_sdl_window_destroy(window); }
}
/* }}} */

/* {{{ proto string SDL_GetWindowTitle(SDL_Window window)

 *  \brief Get the title of a window, in UTF-8 format.
 *
 *  \sa SDL_SetWindowTitle()
 extern DECLSPEC const char *SDLCALL SDL_GetWindowTitle(SDL_Window * window);
 */
PHP_FUNCTION(SDL_GetWindowTitle)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	RETURN_STRING(SDL_GetWindowTitle(window));
}
/* }}} */

/* {{{ proto void SDL_SetWindowTitle(SDL_Window window, string title)

 *  \brief Set the title of a window, in UTF-8 format.
 *
 *  \sa SDL_GetWindowTitle()
 extern DECLSPEC void SDLCALL SDL_SetWindowTitle(SDL_Window * window,
												 const char *title);
 */
PHP_FUNCTION(SDL_SetWindowTitle)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;
	char *title;
	size_t title_len;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Os", &object, php_sdl_window_ce, &title, &title_len) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);

	if (!window_title(title, title_len)) { RETURN_THROWS(); }
	SDL_SetWindowTitle(window, title);
}
/* }}} */

/* {{{ proto bool SDL_IsShapedWindow(SDL_Window window)

* \brief Return whether the given window is a shaped window.
 *
 * \param window The window to query for being shaped.
 *
 * \return SDL_TRUE if the window is a window that can be shaped, SDL_FALSE if the window is unshaped or NULL.
 * \sa SDL_CreateShapedWindow
extern DECLSPEC SDL_bool SDLCALL SDL_IsShapedWindow(const SDL_Window *window);
 */
PHP_FUNCTION(SDL_IsShapedWindow)
{
	struct php_sdl_window *intern;
	zval *object;
	SDL_Window *window;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &object, php_sdl_window_ce) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, object, 1);
	RETVAL_BOOL(SDL_IsShapedWindow(window));
}
/* }}} */

/* {{{ proto int SDL_SetWindowShape(SDL_Window window, SDL_Surface shape, SDL_WindowShapeMode shape_mode)

 * \brief Set the shape and parameters of a shaped window.
 *
 * \param window The shaped window whose parameters should be set.
 * \param shape A surface encoding the desired shape for the window.
 * \param shape_mode The parameters to set for the shaped window.
 *
 * \return 0 on success, SDL_INVALID_SHAPE_ARGUMENT on invalid an invalid shape argument, or SDL_NONSHAPEABLE_WINDOW
 *           if the SDL_Window* given does not reference a valid shaped window.
 *
 * \sa SDL_WindowShapeMode
 * \sa SDL_GetShapedWindowMode.
 extern DECLSPEC int SDLCALL SDL_SetWindowShape(SDL_Window *window,SDL_Surface *shape,SDL_WindowShapeMode *shape_mode);
 */
PHP_FUNCTION(SDL_SetWindowShape)
{
	struct php_sdl_window *intern;
	zval *z_window, *z_surface, *z_mode;
	SDL_Window *window;
	SDL_Surface *surface;
	SDL_WindowShapeMode *mode;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OOO", &z_window, php_sdl_window_ce,
									 &z_surface, get_php_sdl_surface_ce(), &z_mode, get_php_sdl_windowshapemode_ce()) == FAILURE)
	{
		return;
	}
	FETCH_WINDOW(window, z_window, 1);
	surface = zval_to_sdl_surface(z_surface);
	mode = zval_to_sdl_windowshapemode(z_mode);
	if (!surface)
	{
		php_error_docref(NULL, E_WARNING, "Invalid SDL_Surface object");
	}
	else if (!mode)
	{
		php_error_docref(NULL, E_WARNING, "Invalid SDL_WindowShapeMode object");
	}
	else
	{
		RETVAL_LONG(SDL_SetWindowShape(window, surface, mode));
	}
}
/* }}} */

/* {{{ proto int SDL_GetShapedWindowMode(SDL_Window window, SDL_WindowShapeMode &shape_mode)

 * \brief Get the shape parameters of a shaped window.
 *
 * \param window The shaped window whose parameters should be retrieved.
 * \param shape_mode An empty shape-mode structure to fill, or NULL to check whether the window has a shape.
 *
 * \return 0 if the window has a shape and, provided shape_mode was not NULL, shape_mode has been filled with the mode
 *           data, SDL_NONSHAPEABLE_WINDOW if the SDL_Window given is not a shaped window, or SDL_WINDOW_LACKS_SHAPE if
 *           the SDL_Window* given is a shapeable window currently lacking a shape.
 *
 * \sa SDL_WindowShapeMode
 * \sa SDL_SetWindowShape
 extern DECLSPEC int SDLCALL SDL_GetShapedWindowMode(SDL_Window *window,SDL_WindowShapeMode *shape_mode);
 */
PHP_FUNCTION(SDL_GetShapedWindowMode)
{
	php_sdl_window_t *intern;
	zval *z_window, *output;
	SDL_Window *window;
	SDL_WindowShapeMode mode;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oz", &z_window, php_sdl_window_ce, &output) == FAILURE) { RETURN_THROWS(); }
	FETCH_WINDOW(window, z_window, 1);
	int result = SDL_GetShapedWindowMode(window, &mode);
	if (!result) {
		zval value;
		sdl_windowshapemode_to_zval(&mode, &value);
		ZEND_TRY_ASSIGN_REF_COPY(output, &value);
		zval_ptr_dtor(&value);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}
/* }}} */

static const zend_function_entry php_sdl_window_methods[] = {
	PHP_ME(SDL_Window, __construct, arginfo_SDL_CreateWindow, ZEND_ACC_CTOR | ZEND_ACC_PUBLIC)
	PHP_ME(SDL_Window, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)

	/* non-static functions */
	PHP_FALIAS(UpdateSurface, SDL_UpdateWindowSurface, arginfo_window_none)
	PHP_FALIAS(Destroy, SDL_DestroyWindow, arginfo_window_none)
	PHP_FALIAS(GetTitle, SDL_GetWindowTitle, arginfo_window_none)
	PHP_FALIAS(SetTitle, SDL_SetWindowTitle, arginfo_SDL_Window_SetTitle)
	PHP_FALIAS(GetDisplayIndex, SDL_GetWindowDisplayIndex, arginfo_window_none)
	PHP_FALIAS(Show, SDL_ShowWindow, arginfo_window_none)
	PHP_FALIAS(Hide, SDL_HideWindow, arginfo_window_none)
	PHP_FALIAS(Raise, SDL_RaiseWindow, arginfo_window_none)
	PHP_FALIAS(Maximize, SDL_MaximizeWindow, arginfo_window_none)
	PHP_FALIAS(Minimize, SDL_MinimizeWindow, arginfo_window_none)
	PHP_FALIAS(Restore, SDL_RestoreWindow, arginfo_window_none)
	PHP_FALIAS(GetSurface, SDL_GetWindowSurface, arginfo_window_none)
	PHP_FALIAS(SetDisplayMode, SDL_SetWindowDisplayMode, arginfo_SDL_Window_SetDisplayMode)
	PHP_FALIAS(GetDisplayMode, SDL_GetWindowDisplayMode, arginfo_SDL_Window_GetDisplayMode)
	PHP_FALIAS(GetPixelFormat, SDL_GetWindowPixelFormat, arginfo_window_none)
	PHP_FALIAS(GetID, SDL_GetWindowID, arginfo_window_none)
	PHP_FALIAS(GetFlags, SDL_GetWindowFlags, arginfo_window_none)
	PHP_FALIAS(SetIcon, SDL_SetWindowIcon, arginfo_SDL_Window_SetIcon)
	PHP_FALIAS(SetPosition, SDL_SetWindowPosition, arginfo_SDL_Window_SetPosition)
	PHP_FALIAS(GetPosition, SDL_GetWindowPosition, arginfo_SDL_Window_GetPosition)
	PHP_FALIAS(SetSize, SDL_SetWindowSize, arginfo_SDL_Window_SetSize)
	PHP_FALIAS(GetSize, SDL_GetWindowSize, arginfo_SDL_Window_GetSize)
	PHP_FALIAS(SetMinimumSize, SDL_SetWindowMinimumSize, arginfo_SDL_Window_SetPosition)
	PHP_FALIAS(GetMinimumSize, SDL_GetWindowMinimumSize, arginfo_SDL_Window_GetPosition)
	PHP_FALIAS(SetMaximumSize, SDL_SetWindowMaximumSize, arginfo_SDL_Window_SetPosition)
	PHP_FALIAS(GetMaximumSize, SDL_GetWindowMaximumSize, arginfo_SDL_Window_GetPosition)
	PHP_FALIAS(SetBordered, SDL_SetWindowBordered, arginfo_SDL_Window_SetBordered)
	PHP_FALIAS(SetFullscreen, SDL_SetWindowFullscreen, arginfo_SDL_Window_SetFullscreen)
	PHP_FALIAS(UpdateSurfaceRects, SDL_UpdateWindowSurfaceRects, arginfo_SDL_Window_UpdateSurfaceRects)
	PHP_FALIAS(SetGrab, SDL_SetWindowGrab, arginfo_SDL_Window_SetGrab)
	PHP_FALIAS(GetGrab, SDL_GetWindowGrab, arginfo_window_none)
	PHP_FALIAS(SetBrightness, SDL_SetWindowBrightness, arginfo_SDL_Window_SetBrightness)
	PHP_FALIAS(GetBrightness, SDL_GetWindowBrightness, arginfo_window_none)
	PHP_FALIAS(GetGammaRamp, SDL_GetWindowGammaRamp, arginfo_SDL_Window_GetGammaRamp)
	PHP_FALIAS(GL_CreateContext, SDL_GL_CreateContext, arginfo_window_none)
	PHP_FALIAS(GL_MakeCurrent, SDL_GL_MakeCurrent, arginfo_SDL_GLContext)
#if SDL_VERSION_ATLEAST(2, 0, 1)
	PHP_FALIAS(GL_GetDrawableSize, SDL_GL_GetDrawableSize, arginfo_SDL_Window_GetPosition)
#endif
	PHP_FALIAS(GL_Swap, SDL_GL_SwapWindow, arginfo_window_none)
	PHP_FALIAS(WarpMouse, SDL_WarpMouseInWindow, arginfo_SDL_Window_SetPosition)
	PHP_FALIAS(IsShaped, SDL_IsShapedWindow, arginfo_window_none)
	PHP_FALIAS(SetShape, SDL_SetWindowShape, arginfo_SDL_Window_SetShape)
	PHP_FALIAS(GetShapedMode, SDL_GetShapedWindowMode, arginfo_SDL_Window_GetShapedMode)

	/* static methods */
	ZEND_FENTRY(GL_GetCurrent, ZEND_FN(SDL_GL_GetCurrentWindow), arginfo_window_none, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
	ZEND_FENTRY(GetMouseFocus, ZEND_FN(SDL_GetMouseFocus), arginfo_window_none, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)

	PHP_FE_END};

/* {{{ php_sdl_window_free
 */
static void php_sdl_window_free(zend_object *zo)
{
	struct php_sdl_window *intern = (struct php_sdl_window *)((char *)zo - zo->handlers->offset);
	if (intern->window)
	{
		if (!(intern->flags & SDL_DONTFREE))
		{
			php_sdl_window_destroy(intern->window);
		}
	}

	php_sdl_window_t **link = &windows;
	while (*link != intern) { link = &(*link)->next; }
	*link = intern->next;
	zend_object_std_dtor(&intern->zo);
}
/* }}} */

/* {{{ php_sdl_window_new
 */
static zend_object *php_sdl_window_new(zend_class_entry *class_type)
{
	struct php_sdl_window *intern;

	intern = (struct php_sdl_window *)ecalloc(1, sizeof(struct php_sdl_window) + zend_object_properties_size(class_type));

	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);

	intern->window = NULL;
	intern->next = windows;
	windows = intern;

	php_sdl_window_handlers.offset = XtOffsetOf(struct php_sdl_window, zo);
	php_sdl_window_handlers.free_obj = php_sdl_window_free;
	intern->zo.handlers = &php_sdl_window_handlers;

	return &intern->zo;
}
/* }}} */

/* {{{ sdl_window_to_zval */
zend_bool sdl_window_to_zval(SDL_Window *window, zval *z_val, int flags)
{
	if (!window) { ZVAL_NULL(z_val); return 0; }
	for (php_sdl_window_t *item = windows; item; item = item->next) {
		if (item->window == window) { ZVAL_OBJ_COPY(z_val, &item->zo); return 1; }
	}
	object_init_ex(z_val, php_sdl_window_ce);
	return window_assign(php_sdl_window_fetch_object(Z_OBJ_P(z_val)), window, flags);
}
/* }}} */

#define REGISTER_WINDOW_CLASS_CONST_LONG(const_name, value)                               \
	REGISTER_LONG_CONSTANT("SDL_WINDOW_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_window_ce, ZEND_STRL(const_name), value);

#define REGISTER_WINDOWPOS_CLASS_CONST_LONG(const_name, value)                               \
	REGISTER_LONG_CONSTANT("SDL_WINDOWPOS_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_window_ce, ZEND_STRL("POS_" const_name), value);

#define REGISTER_WINDOW_PROP(name) \
	zend_declare_property_long(php_sdl_window_ce, ZEND_STRL(name), 0, ZEND_ACC_PUBLIC)

/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_window)
{
	zend_class_entry ce_window;

	INIT_CLASS_ENTRY(ce_window, "SDL_Window", php_sdl_window_methods);
	php_sdl_window_ce = zend_register_internal_class(&ce_window);
	php_sdl_window_ce->create_object = php_sdl_window_new;
	if (php_sdl_deny_serialization(php_sdl_window_ce) != SUCCESS) { return FAILURE; }
	memcpy(&php_sdl_window_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_window_handlers.get_properties = sdl_window_get_properties;
	php_sdl_window_handlers.get_gc = sdl_window_get_gc;
	php_sdl_window_handlers.clone_obj = NULL;
	php_sdl_window_handlers.free_obj = php_sdl_window_free;
	php_sdl_window_handlers.offset = XtOffsetOf(struct php_sdl_window, zo);

	REGISTER_WINDOW_PROP("id");
	REGISTER_WINDOW_PROP("flags");
	REGISTER_WINDOW_PROP("x");
	REGISTER_WINDOW_PROP("y");
	REGISTER_WINDOW_PROP("w");
	REGISTER_WINDOW_PROP("h");

	zend_declare_property_null(php_sdl_window_ce, ZEND_STRL("title"), ZEND_ACC_PUBLIC);

	REGISTER_WINDOW_CLASS_CONST_LONG("FULLSCREEN", SDL_WINDOW_FULLSCREEN);
	REGISTER_WINDOW_CLASS_CONST_LONG("OPENGL", SDL_WINDOW_OPENGL);
	REGISTER_WINDOW_CLASS_CONST_LONG("SHOWN", SDL_WINDOW_SHOWN);
	REGISTER_WINDOW_CLASS_CONST_LONG("HIDDEN", SDL_WINDOW_HIDDEN);
	REGISTER_WINDOW_CLASS_CONST_LONG("BORDERLESS", SDL_WINDOW_BORDERLESS);
	REGISTER_WINDOW_CLASS_CONST_LONG("RESIZABLE", SDL_WINDOW_RESIZABLE);
	REGISTER_WINDOW_CLASS_CONST_LONG("MINIMIZED", SDL_WINDOW_MINIMIZED);
	REGISTER_WINDOW_CLASS_CONST_LONG("MAXIMIZED", SDL_WINDOW_MAXIMIZED);
	REGISTER_WINDOW_CLASS_CONST_LONG("INPUT_GRABBED", SDL_WINDOW_INPUT_GRABBED);
	REGISTER_WINDOW_CLASS_CONST_LONG("INPUT_FOCUS", SDL_WINDOW_INPUT_FOCUS);
	REGISTER_WINDOW_CLASS_CONST_LONG("MOUSE_FOCUS", SDL_WINDOW_MOUSE_FOCUS);
	REGISTER_WINDOW_CLASS_CONST_LONG("FULLSCREEN_DESKTOP", SDL_WINDOW_FULLSCREEN_DESKTOP);
	REGISTER_WINDOW_CLASS_CONST_LONG("FOREIGN", SDL_WINDOW_FOREIGN);
#if SDL_COMPILEDVERSION > 2000
	REGISTER_WINDOW_CLASS_CONST_LONG("ALLOW_HIGHDPI", SDL_WINDOW_ALLOW_HIGHDPI);
#endif
	REGISTER_WINDOWPOS_CLASS_CONST_LONG("UNDEFINED_MASK", SDL_WINDOWPOS_UNDEFINED_MASK);
	REGISTER_WINDOWPOS_CLASS_CONST_LONG("UNDEFINED", SDL_WINDOWPOS_UNDEFINED);
	REGISTER_WINDOWPOS_CLASS_CONST_LONG("CENTERED_MASK", SDL_WINDOWPOS_CENTERED_MASK);
	REGISTER_WINDOWPOS_CLASS_CONST_LONG("CENTERED", SDL_WINDOWPOS_CENTERED);

	return SUCCESS;
}
/* }}} */
