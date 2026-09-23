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

#include "pixels.h"
#include "php_sdl_extra.h"
#include "zend_interfaces.h"
#include "zend_operators.h"
#include "surface.h"
#include <limits.h>

/* for PHP 8.0 */
#ifndef ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX
#define ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(name, return_reference, required_num_args, type, allow_null) \
	ZEND_BEGIN_ARG_INFO_EX(name, 0, return_reference, required_num_args)
#endif

static zend_class_entry *php_sdl_color_ce;
static zend_object_handlers php_sdl_color_handlers;
struct php_sdl_color
{
	zend_object zo;
};

static zend_class_entry *php_sdl_palette_ce;
static zend_object_handlers php_sdl_palette_handlers;
typedef struct _php_sdl_palette
{
	SDL_Palette *palette;
	Uint32 flags;
	zval owner;
	zend_bool initialized;
	zend_object zo;
} php_sdl_palette;

static zend_class_entry *php_sdl_pixelformat_ce;
static zend_object_handlers php_sdl_pixelformat_handlers;
typedef struct _php_sdl_pixelformat
{
	SDL_PixelFormat *format;
	Uint32 flags;
	zval owner;
	zend_bool initialized;
	zend_object zo;
} php_sdl_pixelformat;

static zend_class_entry *php_sdl_pixels_ce;
static zend_object_handlers php_sdl_pixels_handlers;
typedef struct _php_sdl_pixels
{
	SDL_Pixels pixels;
	Uint32 flags;
	zval owner;
	zend_bool initialized;
	zend_object zo;
} php_sdl_pixels;

zend_class_entry *get_php_sdl_color_ce(void)
{
	return php_sdl_color_ce;
}

zend_class_entry *get_php_sdl_pixelformat_ce(void)
{
	return php_sdl_pixelformat_ce;
}

zend_class_entry *get_php_sdl_palette_ce(void)
{
	return php_sdl_palette_ce;
}

zend_class_entry *get_php_sdl_pixels_ce(void)
{
	return php_sdl_pixels_ce;
}

static inline php_sdl_palette *php_sdl_palette_from_obj(zend_object *obj)
{
	return (php_sdl_palette *)((char *)(obj)-XtOffsetOf(php_sdl_palette, zo));
}

#define FETCH_PALETTE(__ptr, __id, __check)                                                        \
	{                                                                                              \
		intern = PHP_SDL_PALETTE_P(__id);                                                          \
		__ptr = zval_to_sdl_palette(__id);                                                                   \
		if (__check && !__ptr)                                                                     \
		{                                                                                          \
			if (!EG(exception)) { zend_throw_error(NULL, "SDL object has been freed"); } \
			RETURN_THROWS();                                                                         \
		}                                                                                          \
	}

#define PHP_SDL_PALETTE_P(zv) php_sdl_palette_from_obj(Z_OBJ_P((zv)))

static inline php_sdl_pixelformat *php_sdl_pixelformat_from_obj(zend_object *obj)
{
	return (php_sdl_pixelformat *)((char *)(obj)-XtOffsetOf(php_sdl_pixelformat, zo));
}

#define FETCH_PIXELFORMAT(__ptr, __id, __check)                                                    \
	{                                                                                              \
		intern = PHP_SDL_PIXELFORMAT_P(__id);                                                      \
		__ptr = zval_to_sdl_pixelformat(__id);                                                                    \
		if (__check && !__ptr)                                                                     \
		{                                                                                          \
			if (!EG(exception)) { zend_throw_error(NULL, "SDL object has been freed"); } \
			RETURN_THROWS();                                                                         \
		}                                                                                          \
	}

#define PHP_SDL_PIXELFORMAT_P(zv) php_sdl_pixelformat_from_obj(Z_OBJ_P((zv)))

static inline php_sdl_pixels *php_sdl_pixels_from_obj(zend_object *obj)
{
	return (php_sdl_pixels *)((char *)(obj)-XtOffsetOf(php_sdl_pixels, zo));
}

#define PHP_SDL_PIXELS_P(zv) php_sdl_pixels_from_obj(Z_OBJ_P((zv)))

/* Views retain their PHP owner, but explicit/native destruction invalidates them. */
void php_sdl_view_owner(zval *view, zend_object *owner)
{
	if (Z_TYPE_P(view) != IS_OBJECT) { return; }
	zval *slot = NULL;
	if (instanceof_function(Z_OBJCE_P(view), php_sdl_pixels_ce)) { slot = &PHP_SDL_PIXELS_P(view)->owner; }
	else if (instanceof_function(Z_OBJCE_P(view), php_sdl_pixelformat_ce)) { slot = &PHP_SDL_PIXELFORMAT_P(view)->owner; }
	else if (instanceof_function(Z_OBJCE_P(view), php_sdl_palette_ce)) { slot = &PHP_SDL_PALETTE_P(view)->owner; }
	if (slot) { ZVAL_OBJ_COPY(slot, owner); }
}

static zend_bool format_live(php_sdl_pixelformat *intern)
{
	if (!Z_ISUNDEF(intern->owner)) {
		SDL_Surface *surface = zval_to_sdl_surface(&intern->owner);
		if (!surface || surface->format != intern->format) {
			zend_throw_error(NULL, "pixel format's surface has been destroyed"); return 0;
		}
	}
	if (!intern->format) { zend_throw_error(NULL, "pixel format has been freed"); return 0; }
	return 1;
}

static zend_bool palette_live(php_sdl_palette *intern)
{
	if (!Z_ISUNDEF(intern->owner)) {
		SDL_PixelFormat *format = zval_to_sdl_pixelformat(&intern->owner);
		if (!format) { return 0; }
		if (format->palette != intern->palette) {
			zend_throw_error(NULL, "pixel format's palette has been replaced"); return 0;
		}
	}
	if (!intern->palette) { zend_throw_error(NULL, "palette has been freed"); return 0; }
	return 1;
}

static zend_bool pixels_live(php_sdl_pixels *intern, zend_bool access)
{
	if (!Z_ISUNDEF(intern->owner)) {
		SDL_Surface *surface = zval_to_sdl_surface(&intern->owner);
		if (!surface) { zend_throw_error(NULL, "pixel buffer's surface has been destroyed"); return 0; }
		/* RLE locking may replace the surface's storage. Never cache that address. */
		intern->pixels = (SDL_Pixels){surface->h, surface->pitch, surface->pixels};
		if (access && SDL_MUSTLOCK(surface) && !surface->locked) {
			zend_throw_error(NULL, "surface must be locked before accessing its pixels"); return 0;
		}
	}
	if (!intern->initialized || (access && !intern->pixels.pixels)) {
		zend_throw_error(NULL, "pixel buffer has no accessible storage"); return 0;
	}
	return 1;
}

/* Expose retained owners to the collector without synthesizing native properties. */
static HashTable *palette_gc(zend_object *object, zval **table, int *count)
{
	*table = &php_sdl_palette_from_obj(object)->owner; *count = 1;
	return zend_std_get_properties(object);
}
static HashTable *format_gc(zend_object *object, zval **table, int *count)
{
	*table = &php_sdl_pixelformat_from_obj(object)->owner; *count = 1;
	return zend_std_get_properties(object);
}
static HashTable *pixels_gc(zend_object *object, zval **table, int *count)
{
	*table = &php_sdl_pixels_from_obj(object)->owner; *count = 1;
	return zend_std_get_properties(object);
}

zend_bool sdl_color_to_zval(SDL_Color *color, zval *value)
{
	if (color)
	{
		object_init_ex(value, php_sdl_color_ce);
		zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(value), "r", 1, color->r);
		zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(value), "g", 1, color->g);
		zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(value), "b", 1, color->b);
		zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(value), "a", 1, color->a);

		return 1;
	}
	ZVAL_NULL(value);
	return 0;
}

zend_bool zval_to_sdl_color(zval *value, SDL_Color *color)
{
	if (Z_TYPE_P(value) == IS_OBJECT && Z_OBJCE_P(value) == php_sdl_color_ce)
	{
		zval *val, rv;

		val = zend_read_property(php_sdl_color_ce, Z_OBJ_P(value), "r", 1, 0, &rv);
		convert_to_long(val);
		Z_LVAL_P(val) = color->r = (Uint8)Z_LVAL_P(val);

		val = zend_read_property(php_sdl_color_ce, Z_OBJ_P(value), "g", 1, 0, &rv);
		convert_to_long(val);
		Z_LVAL_P(val) = color->g = (Uint8)Z_LVAL_P(val);

		val = zend_read_property(php_sdl_color_ce, Z_OBJ_P(value), "b", 1, 0, &rv);
		convert_to_long(val);
		Z_LVAL_P(val) = color->b = (Uint8)Z_LVAL_P(val);

		val = zend_read_property(php_sdl_color_ce, Z_OBJ_P(value), "a", 1, 0, &rv);
		convert_to_long(val);
		Z_LVAL_P(val) = color->a = (Uint8)Z_LVAL_P(val);

		return 1;
	}
	/* create an empty color */
	memset(color, 0, sizeof(SDL_Color));
	return 0;
}

/* {{{ sdl_palette_to_zval */
zend_bool sdl_palette_to_zval(SDL_Palette *palette, zval *z_val, Uint32 flags)
{
	if (palette)
	{
		php_sdl_palette *intern;

		object_init_ex(z_val, php_sdl_palette_ce);
		intern = PHP_SDL_PALETTE_P(z_val);
		intern->palette = palette;
		intern->flags = flags;
		intern->initialized = 1;

		return 1;
	}
	ZVAL_NULL(z_val);
	return 0;
}
/* }}} */

/* {{{ sdl_pixelformat_to_zval */
zend_bool sdl_pixelformat_to_zval(SDL_PixelFormat *format, zval *z_val, Uint32 flags)
{
	if (format)
	{
		php_sdl_pixelformat *intern;

		object_init_ex(z_val, php_sdl_pixelformat_ce);
		intern = PHP_SDL_PIXELFORMAT_P(z_val);
		intern->format = format;
		intern->flags = flags;
		intern->initialized = 1;

		return 1;
	}

	ZVAL_NULL(z_val);
	return 0;
}
/* }}} */

/* {{{ sdl_pixels_to_zval */
zend_bool sdl_pixels_to_zval(SDL_Pixels *pixels, zval *z_val, Uint32 flags)
{
	if (pixels)
	{
		php_sdl_pixels *intern;

		object_init_ex(z_val, php_sdl_pixels_ce);
		intern = PHP_SDL_PIXELS_P(z_val);
		intern->pixels = *pixels;
		intern->flags = flags;
		intern->initialized = 1;

		return 1;
	}
	ZVAL_NULL(z_val);
	return 0;
}
/* }}} */

/* {{{ zval_to_sdl_pixelformat */
SDL_PixelFormat *zval_to_sdl_pixelformat(zval *z_val)
{
	if (Z_TYPE_P(z_val) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(z_val), php_sdl_pixelformat_ce)) { return NULL; }
	php_sdl_pixelformat *intern = PHP_SDL_PIXELFORMAT_P(z_val);
	return format_live(intern) ? intern->format : NULL;
}
/* }}} */

/* {{{ zval_to_sdl_pixels */
SDL_Pixels *zval_to_sdl_pixels(zval *z_val)
{
	if (Z_TYPE_P(z_val) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(z_val), php_sdl_pixels_ce)) { return NULL; }
	php_sdl_pixels *intern = PHP_SDL_PIXELS_P(z_val);
	return pixels_live(intern, 1) ? &intern->pixels : NULL;
}
/* }}} */

/* Storage ownership is independent of whether a guarded view is accessible. */
zend_bool php_sdl_pixels_owned(zval *value)
{
	return Z_TYPE_P(value) == IS_OBJECT && instanceof_function(Z_OBJCE_P(value), php_sdl_pixels_ce)
		&& !(PHP_SDL_PIXELS_P(value)->flags & SDL_DONTFREE);
}

/* {{{ zval_to_sdl_palette */
SDL_Palette *zval_to_sdl_palette(zval *z_val)
{
	if (Z_TYPE_P(z_val) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(z_val), php_sdl_palette_ce)) { return NULL; }
	php_sdl_palette *intern = PHP_SDL_PALETTE_P(z_val);
	return palette_live(intern) ? intern->palette : NULL;
}
/* }}} */

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Color__construct, 0, 0, 4)
ZEND_ARG_INFO(0, r)
ZEND_ARG_INFO(0, g)
ZEND_ARG_INFO(0, b)
ZEND_ARG_INFO(0, a)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Color::__construct(int r, int g, int b, int a) */
static PHP_METHOD(SDL_Color, __construct)
{
	zend_long r, g, b, a;
	zend_error_handling error_handling;

	zend_replace_error_handling(EH_THROW, NULL, &error_handling);
	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "llll", &r, &g, &b, &a))
	{
		zend_restore_error_handling(&error_handling);
		return;
	}
	zend_restore_error_handling(&error_handling);

	zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(getThis()), "r", 1, r & 255);
	zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(getThis()), "g", 1, g & 255);
	zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(getThis()), "b", 1, b & 255);
	zend_update_property_long(php_sdl_color_ce, Z_OBJ_P(getThis()), "a", 1, a & 255);
}
/* }}} */

/* {{{ proto SDL_Color::__toString() */
static PHP_METHOD(SDL_Color, __toString)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	SDL_Color color;
	if (!php_sdl_read_color(getThis(), &color)) { RETURN_THROWS(); }
	RETURN_STR(strpprintf(0, "SDL_Color(%u,%u,%u,%u)", color.r, color.g, color.b, color.a));
}
/* }}} */

/* {{{ proto string SDL_GetPixelFormatName(int format)

 * \brief Get the human readable name of a pixel format
 extern DECLSPEC const char* SDLCALL SDL_GetPixelFormatName(Uint32 format);
 */
PHP_FUNCTION(SDL_GetPixelFormatName)
{
	zend_long format;
	const char *name;

	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &format) == FAILURE)
	{
		RETURN_FALSE;
	}
	name = SDL_GetPixelFormatName((Uint32)format);
	if (!name)
	{
		RETURN_FALSE;
	}
	RETURN_STRING(name);
}
/* }}} */

/* {{{ proto bool SDL_PixelFormatEnumToMasks(int format, int &bpp, int &Rmask, int &Gmask, int &Bmask, int &Amask)

 *  \brief Convert one of the enumerated pixel formats to a bpp and RGBA masks.
 *
 *  \return SDL_TRUE, or SDL_FALSE if the conversion wasn't possible.
 *
 *  \sa SDL_MasksToPixelFormatEnum()
 extern DECLSPEC SDL_bool SDLCALL SDL_PixelFormatEnumToMasks(Uint32 format,
															 int *bpp,
															 Uint32 * Rmask,
															 Uint32 * Gmask,
															 Uint32 * Bmask,
															 Uint32 * Amask);
 */
PHP_FUNCTION(SDL_PixelFormatEnumToMasks)
{
	zval *z_bpp, *z_rmask, *z_gmask, *z_bmask, *z_amask;
	zend_long format;
	int bpp;
	Uint32 rmask, gmask, bmask, amask;

	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lzzzzz", &format, &z_bpp, &z_rmask, &z_gmask, &z_bmask, &z_amask) == FAILURE)
	{
		RETURN_FALSE;
	}
	if (SDL_PixelFormatEnumToMasks((Uint32)format, &bpp, &rmask, &gmask, &bmask, &amask))
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_bpp, bpp);
	if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_rmask, rmask);
	if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_gmask, gmask);
	if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_bmask, bmask);
	if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_amask, amask);
	if (EG(exception)) { RETURN_THROWS(); }

		RETURN_TRUE;
	}
	RETURN_FALSE;
}
/* }}} */

/* {{{ proto bool SDL_MasksToPixelFormatEnum(int format, int bpp, int Rmask, int Gmask, int Bmask, int Amask)
 *  \brief Convert a bpp and RGBA masks to an enumerated pixel format.
 *
 *  \return The pixel format, or ::SDL_PIXELFORMAT_UNKNOWN if the conversion
 *          wasn't possible.
 *
 *  \sa SDL_PixelFormatEnumToMasks()
 extern DECLSPEC Uint32 SDLCALL SDL_MasksToPixelFormatEnum(int bpp,
														   Uint32 Rmask,
														   Uint32 Gmask,
														   Uint32 Bmask,
														   Uint32 Amask);
 */
PHP_FUNCTION(SDL_MasksToPixelFormatEnum)
{
	zend_long bpp, rmask, gmask, bmask, amask;

	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lllll", &bpp, &rmask, &gmask, &bmask, &amask) == FAILURE)
	{
		RETURN_FALSE;
	}

	RETURN_LONG(SDL_MasksToPixelFormatEnum((int)bpp, (Uint32)rmask, (Uint32)gmask, (Uint32)bmask, (Uint32)amask));
}
/* }}} */

/* {{{ proto SDL_PixelFormat SDL_AllocFormat(int ncolors)

 *  \brief Create an SDL_PixelFormat structure from a pixel format enum.
 extern DECLSPEC SDL_PixelFormat * SDLCALL SDL_AllocFormat(Uint32 pixel_format);
 */
PHP_FUNCTION(SDL_AllocFormat)
{
	zend_long index;
	SDL_PixelFormat *format;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "l", &index))
	{
		return;
	}
	format = SDL_AllocFormat((Uint32)index);
	sdl_pixelformat_to_zval(format, return_value, 0);
}
/* }}} */

/* {{{ proto SDL_PixelFormat::__construct(format) */
static PHP_METHOD(SDL_PixelFormat, __construct)
{
	php_sdl_pixelformat *intern;
	zend_long format;
	zend_error_handling error_handling;

	intern = PHP_SDL_PIXELFORMAT_P(getThis());

	zend_replace_error_handling(EH_THROW, NULL, &error_handling);
	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "l", &format))
	{
		zend_restore_error_handling(&error_handling);
		return;
	}
	zend_restore_error_handling(&error_handling);

	if (intern->initialized) { zend_throw_error(NULL, "SDL_PixelFormat is already initialized"); RETURN_THROWS(); }
	intern->initialized = 1;
	intern->format = SDL_AllocFormat((Uint32)format);
	if (intern->format)
	{
		intern->flags = 0;
	}
	else
	{
		zend_throw_exception(zend_ce_exception, SDL_GetError(), 0);
	}
}
/* }}} */

/* {{{ proto SDL_PixelFormat::__toString() */
static PHP_METHOD(SDL_PixelFormat, __toString)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	php_sdl_pixelformat *intern = PHP_SDL_PIXELFORMAT_P(getThis());
	if (!format_live(intern)) { RETURN_THROWS(); }
	RETURN_STR(strpprintf(0, "SDL_PixelFormat(%s)", SDL_GetPixelFormatName(intern->format->format)));
}
/* }}} */

/* {{{ proto void SDL_FreeFormat(SDL_PixelFormat format)

 *  \brief Free an SDL_PixelFormat structure.
 extern DECLSPEC void SDLCALL SDL_FreeFormat(SDL_PixelFormat *format);
 */
PHP_FUNCTION(SDL_FreeFormat)
{
	zval *value;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_pixelformat_ce) == FAILURE) { RETURN_THROWS(); }
	php_sdl_pixelformat *intern = PHP_SDL_PIXELFORMAT_P(value);
	if (intern->flags & SDL_DONTFREE) { zend_throw_error(NULL, "borrowed format belongs to its owner"); RETURN_THROWS(); }
	SDL_PixelFormat *pointer = intern->format; intern->format = NULL;
	if (pointer) { SDL_FreeFormat(pointer); }
}
/* }}} */

/* {{{ proto SDL_Palette SDL_AllocPalette(int ncolors)

 *  \brief Create a palette structure with the specified number of color
 *         entries.
 *
 *  \return A new palette, or NULL if there wasn't enough memory.
 *
 *  \note The palette entries are initialized to white.
 *
 *  \sa SDL_FreePalette()
 extern DECLSPEC SDL_Palette *SDLCALL SDL_AllocPalette(int ncolors);
*/
PHP_FUNCTION(SDL_AllocPalette)
{
	zend_long ncolors;
	SDL_Palette *palette;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "l", &ncolors))
	{
		return;
	}
	palette = SDL_AllocPalette((int)ncolors);
	sdl_palette_to_zval(palette, return_value, 0);
}
/* }}} */

/* {{{ proto SDL_Palette::__construct(ncolors) */
static PHP_METHOD(SDL_Palette, __construct)
{
	php_sdl_palette *intern;
	zend_long ncolors;
	zend_error_handling error_handling;

	intern = PHP_SDL_PALETTE_P(getThis());

	zend_replace_error_handling(EH_THROW, NULL, &error_handling);
	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "l", &ncolors))
	{
		zend_restore_error_handling(&error_handling);
		return;
	}
	zend_restore_error_handling(&error_handling);

	if (intern->initialized) { zend_throw_error(NULL, "SDL_Palette is already initialized"); RETURN_THROWS(); }
	if (ncolors <= 0 || ncolors > INT_MAX / (int)sizeof(SDL_Color)) { zend_value_error("palette size must be positive and fit int32 storage"); RETURN_THROWS(); }
	intern->initialized = 1;
	intern->palette = SDL_AllocPalette(ncolors);
	if (intern->palette)
	{
		intern->flags = 0;
	}
	else
	{
		zend_throw_exception(zend_ce_exception, SDL_GetError(), 0);
	}
}
/* }}} */

/* {{{ proto SDL_Palette::__toString() */
static PHP_METHOD(SDL_Palette, __toString)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	php_sdl_palette *intern = PHP_SDL_PALETTE_P(getThis());
	if (!palette_live(intern)) { RETURN_THROWS(); }
	RETURN_STR(strpprintf(0, "SDL_Palette(%d)", intern->palette->ncolors));
}
/* }}} */

/* {{{ proto SDL_Palette, count(void)  */
static PHP_METHOD(SDL_Palette, count)
{
	php_sdl_palette *intern;

	intern = PHP_SDL_PALETTE_P(getThis());
	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}

	if (!palette_live(intern)) { RETURN_THROWS(); }

	RETURN_LONG(intern->palette ? intern->palette->ncolors : 0);
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Palette_offsetExists, 0, 1, _IS_BOOL, 0)
ZEND_ARG_INFO(0, offset)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Palette, offsetExists(int offset) */
PHP_METHOD(SDL_Palette, offsetExists)
{
	php_sdl_palette *intern;
	zend_long offset;

	intern = PHP_SDL_PALETTE_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &offset) == FAILURE)
	{
		return;
	}
	if (!palette_live(intern)) { RETURN_THROWS(); }

	if (!intern->palette || offset < 0 || offset >= (intern->palette->ncolors))
	{
		RETURN_FALSE;
	}
	RETURN_TRUE;
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Palette_offsetGet, 0, 1, IS_MIXED, 1)
ZEND_ARG_INFO(0, offset)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Palette, offsetGet(int offset) */
PHP_METHOD(SDL_Palette, offsetGet)
{
	php_sdl_palette *intern;
	zend_long offset;

	intern = PHP_SDL_PALETTE_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &offset) == FAILURE)
	{
		return;
	}
	if (!palette_live(intern)) { RETURN_THROWS(); }

	if (!intern->palette || offset < 0 || offset >= (intern->palette->ncolors))
	{
		zend_throw_exception(zend_ce_exception, "Invalid offset in SDL_Pixels", 0);
		RETURN_FALSE;
	}
	sdl_color_to_zval(intern->palette->colors + offset, return_value);
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Palette_offsetUnset, 0, 1, IS_VOID, 0)
ZEND_ARG_INFO(0, offset)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Palette, offsetUnset(int offset) */
PHP_METHOD(SDL_Palette, offsetUnset)
{
	php_sdl_palette *intern;
	zend_long offset;
	SDL_Color color;

	intern = PHP_SDL_PALETTE_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &offset) == FAILURE)
	{
		return;
	}
	if (!palette_live(intern)) { RETURN_THROWS(); }

	if (!intern->palette || offset < 0 || offset >= (intern->palette->ncolors))
	{
		zend_throw_exception(zend_ce_exception, "Invalid offset in SDL_Pixels", 0);
		RETURN_FALSE;
	}
	memset(&color, 0, sizeof(color));
	SDL_SetPaletteColors(intern->palette, &color, (int)offset, 1);
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Palette_offsetSet, 0, 2, IS_VOID, 0)
ZEND_ARG_INFO(0, offset)
ZEND_ARG_INFO(0, color)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Palette, offsetSet(int offset, int value) */
PHP_METHOD(SDL_Palette, offsetSet)
{
	php_sdl_palette *intern;
	zend_long offset;
	zval *z_color;
	SDL_Color color;

	intern = PHP_SDL_PALETTE_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lO", &offset, &z_color, php_sdl_color_ce) == FAILURE)
	{
		return;
	}
	if (!php_sdl_read_color(z_color, &color)) { RETURN_THROWS(); }
	if (!palette_live(intern)) { RETURN_THROWS(); }

	if (!intern->palette || offset < 0 || offset >= (intern->palette->ncolors))
	{
		zend_throw_exception(zend_ce_exception, "Invalid offset in SDL_Pixels", 0);
		RETURN_FALSE;
	}
	SDL_SetPaletteColors(intern->palette, &color, (int)offset, 1);
}
/* }}} */

/* {{{ proto int SDL_SetPixelFormatPalette(SDL_PixelFormat format, SDL_Palette palette);

 *  \brief Set the palette for a pixel format structure.
 extern DECLSPEC int SDLCALL SDL_SetPixelFormatPalette(SDL_PixelFormat * format,
													   SDL_Palette *palette);
 */
PHP_FUNCTION(SDL_SetPixelFormatPalette)
{
	php_sdl_palette *intern;
	zval *z_format, *z_palette;
	SDL_Palette *palette;
	SDL_PixelFormat *format;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO", &z_format, php_sdl_pixelformat_ce, &z_palette, php_sdl_palette_ce) == FAILURE)
	{
		return;
	}
	FETCH_PALETTE(palette, z_palette, 1);
	format = zval_to_sdl_pixelformat(z_format);
	if (!format) { RETURN_THROWS(); }

	RETURN_LONG(SDL_SetPixelFormatPalette(format, palette));
}
/* }}} */

/* {{{ proto int SDL_SetPaletteColors(SDL_Palette palette, array colors, int first, int ncolors)

 *  \brief Set a range of colors in a palette.
 *
 *  \param palette    The palette to modify.
 *  \param colors     An array of colors to copy into the palette.
 *  \param firstcolor The index of the first palette entry to modify.
 *  \param ncolors    The number of entries to modify.
 *
 *  \return 0 on success, or -1 if not all of the colors could be set.
 extern DECLSPEC int SDLCALL SDL_SetPaletteColors(SDL_Palette * palette,
												  const SDL_Color * colors,
												  int firstcolor, int ncolors);
 */
PHP_FUNCTION(SDL_SetPaletteColors)
{
	zval *value, *array;
	zend_long first = 0, count = 0;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oa|ll", &value, php_sdl_palette_ce, &array, &first, &count) == FAILURE) { RETURN_THROWS(); }
	zend_long length = zend_hash_num_elements(Z_ARRVAL_P(array));
	if (!count) { count = length; }
	if (first < 0 || first > INT_MAX || count < 0 || count > length || count > INT_MAX / (int)sizeof(SDL_Color)) {
		zend_value_error("color count and first index must fit the array and int32"); RETURN_THROWS();
	}
	/* Pin the array: callbacks may mutate the caller's array or destroy its palette. */
	zval snapshot; ZVAL_COPY(&snapshot, array);
	SDL_Color *colors = safe_emalloc(count, sizeof(SDL_Color), 0);
	for (zend_long i = 0; i < count; i++) {
		zval *color = zend_hash_index_find(Z_ARRVAL(snapshot), i);
		if (!color) { zend_value_error("colors must contain consecutive indices from zero"); }
		if (!color || !php_sdl_read_color(color, &colors[i])) { break; }
	}
	zval_ptr_dtor(&snapshot);
	SDL_Palette *palette = EG(exception) ? NULL : zval_to_sdl_palette(value);
	if (!palette) { efree(colors); RETURN_THROWS(); }
	if (first > palette->ncolors || count > palette->ncolors - first) {
		efree(colors); zend_value_error("colors must fit the palette"); RETURN_THROWS();
	}
	int result = count ? SDL_SetPaletteColors(palette, colors, first, count) : 0;
	efree(colors); RETURN_LONG(result);
}
/* }}} */

/* {{{ proto void SDL_FreePalette(SDL_Palette palette)

 *  \brief Free a palette created with SDL_AllocPalette().
 *
 *  \sa SDL_AllocPalette()
 extern DECLSPEC void SDLCALL SDL_FreePalette(SDL_Palette * palette);
 */
PHP_FUNCTION(SDL_FreePalette)
{
	zval *value;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_palette_ce) == FAILURE) { RETURN_THROWS(); }
	php_sdl_palette *intern = PHP_SDL_PALETTE_P(value);
	if (intern->flags & SDL_DONTFREE) { zend_throw_error(NULL, "borrowed palette belongs to its owner"); RETURN_THROWS(); }
	SDL_Palette *pointer = intern->palette; intern->palette = NULL;
	if (pointer) { SDL_FreePalette(pointer); }
}
/* }}} */

/* {{{ proto int SDL_MapRGB(SDL_PixelFormat format, int r, int g, int b)

 *  \brief Maps an RGB triple to an opaque pixel value for a given pixel format.
 *
 *  \sa SDL_MapRGBA
 extern DECLSPEC Uint32 SDLCALL SDL_MapRGB(const SDL_PixelFormat * format,
										   Uint8 r, Uint8 g, Uint8 b);
 */
PHP_FUNCTION(SDL_MapRGB)
{
	php_sdl_pixelformat *intern;
	zval *z_format;
	SDL_PixelFormat *format;
	zend_long r, g, b;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Olll", &z_format, php_sdl_pixelformat_ce, &r, &g, &b) == FAILURE)
	{
		return;
	}
	FETCH_PIXELFORMAT(format, z_format, 1);

	RETURN_LONG(SDL_MapRGB(format, (Uint8)r, (Uint8)g, (Uint8)b));
}
/* }}} */

/* {{{ proto int SDL_MapRGBA(SDL_PixelFormat format, int r, int g, int b, int a)

 *  \brief Maps an RGBA quadruple to a pixel value for a given pixel format.
 *
 *  \sa SDL_MapRGB
 extern DECLSPEC Uint32 SDLCALL SDL_MapRGBA(const SDL_PixelFormat * format,
											Uint8 r, Uint8 g, Uint8 b,
											Uint8 a);
 */
PHP_FUNCTION(SDL_MapRGBA)
{
	php_sdl_pixelformat *intern;
	zval *z_format;
	SDL_PixelFormat *format;
	zend_long r, g, b, a;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ollll", &z_format, php_sdl_pixelformat_ce, &r, &g, &b, &a) == FAILURE)
	{
		return;
	}
	FETCH_PIXELFORMAT(format, z_format, 1);

	RETURN_LONG(SDL_MapRGBA(format, (Uint8)r, (Uint8)g, (Uint8)b, (Uint8)a));
}
/* }}} */

/* {{{ proto void SDL_GetRGB(int pixel, SDL_PixelFormat format, int &r, int &g, int &b)

 *  \brief Get the RGB components from a pixel of the specified format.
 *
 *  \sa SDL_GetRGBA
 extern DECLSPEC void SDLCALL SDL_GetRGB(Uint32 pixel,
										 const SDL_PixelFormat * format,
										 Uint8 * r, Uint8 * g, Uint8 * b);
 */
PHP_FUNCTION(SDL_GetRGB)
{
	php_sdl_pixelformat *intern;
	zval *z_format, *z_r, *z_g, *z_b;
	SDL_PixelFormat *format;
	Uint8 r, g, b;
	zend_long pix;

	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lOzzz", &pix, &z_format, php_sdl_pixelformat_ce, &z_r, &z_g, &z_b) == FAILURE)
	{
		return;
	}
	FETCH_PIXELFORMAT(format, z_format, 1);
	SDL_GetRGB((Uint32)pix, format, &r, &g, &b);
	ZEND_TRY_ASSIGN_REF_LONG(z_r, r);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_g, g);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_b, b);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_PixelFormat_GetRGB, 0, 0, 4)
ZEND_ARG_INFO(0, pixel)
ZEND_ARG_INFO(1, r)
ZEND_ARG_INFO(1, g)
ZEND_ARG_INFO(1, b)
ZEND_END_ARG_INFO()

/* {{{ proto int SDL_PixelFormat::GetRGB(int pixel, int &r, int &g, int &b)

 Duplicate implementation because for param order
*/
PHP_METHOD(SDL_PixelFormat, GetRGB)
{
	php_sdl_pixelformat *intern;
	zval *z_format, *z_r, *z_g, *z_b;
	SDL_PixelFormat *format;
	Uint8 r, g, b;
	zend_long pix;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Olzzz", &z_format, php_sdl_pixelformat_ce, &pix, &z_r, &z_g, &z_b) == FAILURE)
	{
		return;
	}
	FETCH_PIXELFORMAT(format, z_format, 1);
	SDL_GetRGB((Uint32)pix, format, &r, &g, &b);
	ZEND_TRY_ASSIGN_REF_LONG(z_r, r);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_g, g);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_b, b);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

/* {{{ proto void SDL_GetRGBA(int pixel, SDL_PixelFormat format, int &r, int &g, int &b, int &a)

 *  \brief Get the RGBA components from a pixel of the specified format.
 *
 *  \sa SDL_GetRGB
 extern DECLSPEC void SDLCALL SDL_GetRGBA(Uint32 pixel,
										  const SDL_PixelFormat * format,
										  Uint8 * r, Uint8 * g, Uint8 * b,
										  Uint8 * a);
 */
PHP_FUNCTION(SDL_GetRGBA)
{
	php_sdl_pixelformat *intern;
	zval *z_format, *z_r, *z_g, *z_b, *z_a;
	SDL_PixelFormat *format;
	Uint8 r, g, b, a;
	zend_long pix;

	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lOzzzz", &pix, &z_format, php_sdl_pixelformat_ce, &z_r, &z_g, &z_b, &z_a) == FAILURE)
	{
		return;
	}
	FETCH_PIXELFORMAT(format, z_format, 1);
	SDL_GetRGBA((Uint32)pix, format, &r, &g, &b, &a);
	ZEND_TRY_ASSIGN_REF_LONG(z_r, r);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_g, g);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_b, b);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_a, a);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

/* {{{ proto int SDL_PixelFormat::GetRGBA(int pixel, int &r, int &g, int &b, int &a)

 Duplicate implementation because for param order
*/
PHP_METHOD(SDL_PixelFormat, GetRGBA)
{
	php_sdl_pixelformat *intern;
	zval *z_format, *z_r, *z_g, *z_b, *z_a;
	SDL_PixelFormat *format;
	Uint8 r, g, b, a;
	zend_long pix;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Olzzzz", &z_format, php_sdl_pixelformat_ce, &pix, &z_r, &z_g, &z_b, &z_a) == FAILURE)
	{
		return;
	}
	FETCH_PIXELFORMAT(format, z_format, 1);
	SDL_GetRGBA((Uint32)pix, format, &r, &g, &b, &a);
	ZEND_TRY_ASSIGN_REF_LONG(z_r, r);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_g, g);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_b, b);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_a, a);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

/* {{{ proto void SDL_CalculateGammaRamp(float gamma, array &ramp)

 *  \brief Calculate a 256 entry gamma ramp for a gamma value.
 extern DECLSPEC void SDLCALL SDL_CalculateGammaRamp(float gamma, Uint16 * ramp);
 */
PHP_FUNCTION(SDL_CalculateGammaRamp)
{
	double gamma; zval *output, values; Uint16 ramp[256];
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "dz", &gamma, &output) == FAILURE) { RETURN_THROWS(); }
	SDL_CalculateGammaRamp(gamma, ramp);
	array_init_size(&values, 256);
	for (int i = 0; i < 256; i++) { add_next_index_long(&values, ramp[i]); }
	ZEND_TRY_ASSIGN_REF_COPY(output, &values);
	zval_ptr_dtor(&values);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Pixels__construct, 0, 0, 2)
ZEND_ARG_INFO(0, pitch)
ZEND_ARG_INFO(0, h)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Pixels::__construct(int pitch, int h) */
static PHP_METHOD(SDL_Pixels, __construct)
{
	zend_long pitch, height;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "ll", &pitch, &height) == FAILURE) { RETURN_THROWS(); }
	php_sdl_pixels *intern = PHP_SDL_PIXELS_P(getThis());
	if (intern->initialized) { zend_throw_error(NULL, "SDL_Pixels is already initialized"); RETURN_THROWS(); }
	if (pitch <= 0 || pitch > INT_MAX - 3 || height <= 0 || height > INT_MAX
		|| ((pitch + 3) & ~3) > INT_MAX / height) {
		zend_value_error("aligned pitch times height must be positive and fit int32"); RETURN_THROWS();
	}
	intern->initialized = 1;
	intern->pixels.pitch = (pitch + 3) & ~3;
	intern->pixels.h = height;
	intern->pixels.pixels = ecalloc(intern->pixels.pitch, intern->pixels.h);
}
/* }}} */

/* {{{ proto SDL_Pixels::__toString() */
static PHP_METHOD(SDL_Pixels, __toString)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	php_sdl_pixels *intern = PHP_SDL_PIXELS_P(getThis());
	if (!pixels_live(intern, 0)) { RETURN_THROWS(); }
	RETURN_STR(strpprintf(0, "SDL_Pixels(%d,%d)", intern->pixels.pitch, intern->pixels.h));
}
/* }}} */

/* {{{ proto SDL_Pixels, count(void) */
static PHP_METHOD(SDL_Pixels, count)
{
	php_sdl_pixels *intern;

	intern = PHP_SDL_PIXELS_P(getThis());
	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}

	if (!pixels_live(intern, 0)) { RETURN_THROWS(); }

	RETURN_LONG(intern->pixels.h * intern->pixels.pitch);
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Pixels_offsetExists, 0, 1, _IS_BOOL, 0)
ZEND_ARG_INFO(0, offset)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Pixels, offsetExists(int offset) */
PHP_METHOD(SDL_Pixels, offsetExists)
{
	php_sdl_pixels *intern;
	zend_long offset;

	intern = PHP_SDL_PIXELS_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &offset) == FAILURE)
	{
		return;
	}
	if (!pixels_live(intern, 0)) { RETURN_THROWS(); }

	if (offset < 0 || offset >= (intern->pixels.h * intern->pixels.pitch))
	{
		RETURN_FALSE;
	}
	RETURN_TRUE;
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Pixels_offsetGet, 0, 1, IS_MIXED, 1)
ZEND_ARG_INFO(0, offset)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Pixels, offsetGet(int offset) */
PHP_METHOD(SDL_Pixels, offsetGet)
{
	php_sdl_pixels *intern;
	zend_long offset;

	intern = PHP_SDL_PIXELS_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &offset) == FAILURE)
	{
		return;
	}
	if (!pixels_live(intern, 1)) { RETURN_THROWS(); }

	if (offset < 0 || offset >= (intern->pixels.h * intern->pixels.pitch))
	{
		zend_throw_exception(zend_ce_exception, "Invalid offset in SDL_Pixels", 0);
		RETURN_FALSE;
	}
	RETVAL_LONG(intern->pixels.pixels[offset]);
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Pixels_offsetUnset, 0, 1, IS_VOID, 0)
ZEND_ARG_INFO(0, offset)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Pixels, offsetUnset(int offset) */
PHP_METHOD(SDL_Pixels, offsetUnset)
{
	php_sdl_pixels *intern;
	zend_long offset;

	intern = PHP_SDL_PIXELS_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &offset) == FAILURE)
	{
		return;
	}
	if (!pixels_live(intern, 1)) { RETURN_THROWS(); }

	if (offset < 0 || offset >= (intern->pixels.h * intern->pixels.pitch))
	{
		zend_throw_exception(zend_ce_exception, "Invalid offset in SDL_Pixels", 0);
		RETURN_FALSE;
	}
	intern->pixels.pixels[offset] = 0;
}
/* }}} */

ZEND_BEGIN_ARG_WITH_TENTATIVE_RETURN_TYPE_INFO_EX(arginfo_SDL_Pixels_offsetSet, 0, 2, IS_VOID, 0)
ZEND_ARG_INFO(0, offset)
ZEND_ARG_INFO(0, value)
ZEND_END_ARG_INFO()

/* {{{ proto SDL_Pixels, offsetSet(int offset, int value) */
PHP_METHOD(SDL_Pixels, offsetSet)
{
	php_sdl_pixels *intern;
	zend_long offset, value;

	intern = PHP_SDL_PIXELS_P(getThis());
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "ll", &offset, &value) == FAILURE)
	{
		return;
	}
	if (!pixels_live(intern, 1)) { RETURN_THROWS(); }

	if (offset < 0 || offset >= (intern->pixels.h * intern->pixels.pitch))
	{
		zend_throw_exception(zend_ce_exception, "Invalid offset in SDL_Pixels", 0);
		RETURN_FALSE;
	}
	intern->pixels.pixels[offset] = (Uint8)value;
}
/* }}} */

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Pixels_GetByte, 0, 0, 2)
ZEND_ARG_INFO(0, x)
ZEND_ARG_INFO(0, y)
ZEND_END_ARG_INFO()

/* {{{ proto int SDL_Pixels::GetByte(int x, int y) */
PHP_METHOD(SDL_Pixels, GetByte)
{
	php_sdl_pixels *intern;
	zval *z_pixels;
	zend_long x, y;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oll", &z_pixels, php_sdl_pixels_ce, &x, &y) == FAILURE)
	{
		return;
	}
	intern = PHP_SDL_PIXELS_P(z_pixels);
	if (!pixels_live(intern, 1)) { RETURN_THROWS(); }

	if (x < 0 || x >= intern->pixels.pitch || y < 0 || y >= intern->pixels.h)
	{
		php_error_docref(NULL, E_NOTICE, "Invalid position (%ld,%ld) in SDL_Pixels (%d,%d)", (long)x, (long)y, intern->pixels.pitch, intern->pixels.h);
		RETURN_FALSE;
	}
	RETVAL_LONG(intern->pixels.pixels[y * intern->pixels.pitch + x]);
}
/* }}} */

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Pixels_SetByte, 0, 0, 3)
ZEND_ARG_INFO(0, x)
ZEND_ARG_INFO(0, y)
ZEND_ARG_INFO(0, byte)
ZEND_END_ARG_INFO()

/* {{{ proto int SDL_Pixels::SetByte(int x, int y, int byte) */
PHP_METHOD(SDL_Pixels, SetByte)
{
	php_sdl_pixels *intern;
	zval *z_pixels;
	zend_long x, y, v;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Olll", &z_pixels, php_sdl_pixels_ce, &x, &y, &v) == FAILURE)
	{
		return;
	}
	intern = PHP_SDL_PIXELS_P(z_pixels);
	if (!pixels_live(intern, 1)) { RETURN_THROWS(); }

	if (x < 0 || x >= intern->pixels.pitch || y < 0 || y >= intern->pixels.h)
	{
		php_error_docref(NULL, E_NOTICE, "Invalid position (%ld,%ld) in SDL_Pixels (%d,%d)", (long)x, (long)y, intern->pixels.pitch, intern->pixels.h);
		RETURN_FALSE;
	}
	RETVAL_LONG(intern->pixels.pixels[y * intern->pixels.pitch + x]);
	intern->pixels.pixels[y * intern->pixels.pitch + x] = (Uint8)v;
}
/* }}} */

/* {{{ php_sdl_palette_free
 */
static void php_sdl_palette_free(zend_object *object)
{
	php_sdl_palette *intern = php_sdl_palette_from_obj(object);

	if (intern->palette)
	{
		if (!(intern->flags & SDL_DONTFREE))
		{
			SDL_FreePalette(intern->palette);
		}
	}

	zval_ptr_dtor(&intern->owner);
	zend_object_std_dtor(&intern->zo);
}
/* }}} */

/* {{{ php_sdl_palette_new
 */
static zend_object *php_sdl_palette_new(zend_class_entry *class_type)
{
	php_sdl_palette *intern = zend_object_alloc(sizeof(php_sdl_palette), class_type);

	ZVAL_UNDEF(&intern->owner);
	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);

	intern->palette = NULL;
	intern->zo.handlers = (zend_object_handlers *)&php_sdl_palette_handlers;

	return &intern->zo;
}
/* }}} */

/* {{{ sdl_palette_read_property*/
zval *sdl_palette_read_property(zend_object *object, zend_string *member, int type, void **cache_slot, zval *rv)
{
	php_sdl_palette *intern = php_sdl_palette_from_obj(object);
	char *member_val = ZSTR_VAL(member);
	zval *retval;

	if (!palette_live(intern)) { ZVAL_NULL(rv); return rv; }

	retval = rv;

	if (!strcmp(member_val, "ncolors"))
	{
		ZVAL_LONG(retval, intern->palette->ncolors);
	}
	else if (!strcmp(member_val, "version"))
	{
		ZVAL_LONG(retval, intern->palette->version);
	}
	else if (!strcmp(member_val, "refcount"))
	{
		ZVAL_LONG(retval, intern->palette->refcount);
	}
	else if (!strcmp(member_val, "colors"))
	{
		int i;
		zval z_color;
		array_init(retval);
		for (i = 0; i < intern->palette->ncolors; i++)
		{
			sdl_color_to_zval(&intern->palette->colors[i], &z_color);
			add_next_index_zval(retval, &z_color);
		}
	}
	else
	{
		retval = zend_std_read_property(object, member, type, cache_slot, rv);

		return retval;
	}

	return retval;
}
/* }}} */

#define SDL_PALETTE_ADD_PROPERTY(n, f) \
	ZVAL_LONG(&zv, f);                 \
	zend_hash_str_update(props, n, sizeof(n) - 1, &zv);

/* {{{ sdl_palette_get_properties*/
static HashTable *sdl_palette_get_properties(zend_object *object)
{
	HashTable *props = zend_std_get_properties(object);
	const char *names[] = {"ncolors", "version", "refcount", "colors"};
	zval values[4];
	int count = 0;
	for (unsigned int i = 0; i < sizeof(names) / sizeof(*names); i++) {
		zend_string *name = zend_string_init(names[i], strlen(names[i]), 0);
		ZVAL_UNDEF(&values[i]);
		sdl_palette_read_property(object, name, BP_VAR_R, NULL, &values[i]);
		zend_string_release(name);
		count++;
		if (EG(exception)) { break; }
	}
	for (int i = 0; i < count; i++) {
		if (!EG(exception)) { zend_hash_str_update(props, names[i], strlen(names[i]), &values[i]); }
		else { zval_ptr_dtor(&values[i]); }
	}
	return props;
}
/* }}} */

/* {{{ sdl_palette_write_property */
static zval *sdl_palette_write_property(zend_object *object, zend_string *name, zval *value, void **cache_slot)
{
	zend_throw_error(NULL, "Not supported, use SDL_SetPaletteColors() or SDL_Palette::SetColors()");
	return value;
}
/* }}} */

/* {{{ php_sdl_pixelformat_free
 */
static void php_sdl_pixelformat_free(zend_object *object)
{
	php_sdl_pixelformat *intern = php_sdl_pixelformat_from_obj(object);

	if (intern->format)
	{
		if (!(intern->flags & SDL_DONTFREE))
		{
			SDL_FreeFormat(intern->format);
		}
	}

	zval_ptr_dtor(&intern->owner);
	zend_object_std_dtor(&intern->zo);
}
/* }}} */

/* {{{ php_sdl_pixelformat_new
 */
static zend_object *php_sdl_pixelformat_new(zend_class_entry *class_type)
{
	php_sdl_pixelformat *intern = zend_object_alloc(sizeof(php_sdl_pixelformat), class_type);

	ZVAL_UNDEF(&intern->owner);
	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);

	intern->format = NULL;
	intern->zo.handlers = (zend_object_handlers *)&php_sdl_pixelformat_handlers;

	return &intern->zo;
}
/* }}} */

/* {{{ sdl_pixelformat_read_property*/
zval *sdl_pixelformat_read_property(zend_object *object, zend_string *member, int type, void **cache_slot, zval *rv)
{
	php_sdl_pixelformat *intern = php_sdl_pixelformat_from_obj(object);
	char *member_val = ZSTR_VAL(member);
	zval *retval;

	if (!format_live(intern)) { ZVAL_NULL(rv); return rv; }

	retval = rv;

	if (!strcmp(member_val, "format"))
	{
		ZVAL_LONG(retval, intern->format->format);
	}
	else if (!strcmp(member_val, "BitsPerPixel"))
	{
		ZVAL_LONG(retval, intern->format->BitsPerPixel);
	}
	else if (!strcmp(member_val, "BytesPerPixel"))
	{
		ZVAL_LONG(retval, intern->format->BytesPerPixel);
	}
	else if (!strcmp(member_val, "Rmask"))
	{
		ZVAL_LONG(retval, intern->format->Rmask);
	}
	else if (!strcmp(member_val, "Gmask"))
	{
		ZVAL_LONG(retval, intern->format->Gmask);
	}
	else if (!strcmp(member_val, "Bmask"))
	{
		ZVAL_LONG(retval, intern->format->Bmask);
	}
	else if (!strcmp(member_val, "Amask"))
	{
		ZVAL_LONG(retval, intern->format->Amask);
	}
	else if (!strcmp(member_val, "Rloss"))
	{
		ZVAL_LONG(retval, intern->format->Rloss);
	}
	else if (!strcmp(member_val, "Gloss"))
	{
		ZVAL_LONG(retval, intern->format->Gloss);
	}
	else if (!strcmp(member_val, "Bloss"))
	{
		ZVAL_LONG(retval, intern->format->Bloss);
	}
	else if (!strcmp(member_val, "Aloss"))
	{
		ZVAL_LONG(retval, intern->format->Aloss);
	}
	else if (!strcmp(member_val, "Rshift"))
	{
		ZVAL_LONG(retval, intern->format->Rshift);
	}
	else if (!strcmp(member_val, "Gshift"))
	{
		ZVAL_LONG(retval, intern->format->Gshift);
	}
	else if (!strcmp(member_val, "Bshift"))
	{
		ZVAL_LONG(retval, intern->format->Bshift);
	}
	else if (!strcmp(member_val, "Ashift"))
	{
		ZVAL_LONG(retval, intern->format->Ashift);
	}
	else if (!strcmp(member_val, "palette"))
	{
		sdl_palette_to_zval(intern->format->palette, retval, SDL_DONTFREE);
		php_sdl_view_owner(retval, object);
	}
	else
	{
		retval = zend_std_read_property(object, member, type, cache_slot, rv);

		return retval;
	}

	return retval;
}
/* }}} */

#define SDL_PIXELFORMAT_ADD_PROPERTY(n, f) \
	ZVAL_LONG(&zv, f);                     \
	zend_hash_str_update(props, n, sizeof(n) - 1, &zv);

/* {{{ sdl_pixelformat_read_property*/
static HashTable *sdl_pixelformat_get_properties(zend_object *object)
{
	HashTable *props = zend_std_get_properties(object);
	const char *names[] = {"format", "BitsPerPixel", "BytesPerPixel", "Rmask", "Gmask", "Bmask", "Amask", "Rloss", "Gloss", "Bloss", "Aloss", "Rshift", "Gshift", "Bshift", "Ashift", "palette"};
	zval values[16];
	int count = 0;
	for (unsigned int i = 0; i < sizeof(names) / sizeof(*names); i++) {
		zend_string *name = zend_string_init(names[i], strlen(names[i]), 0);
		ZVAL_UNDEF(&values[i]);
		sdl_pixelformat_read_property(object, name, BP_VAR_R, NULL, &values[i]);
		zend_string_release(name);
		count++;
		if (EG(exception)) { break; }
	}
	for (int i = 0; i < count; i++) {
		if (!EG(exception)) { zend_hash_str_update(props, names[i], strlen(names[i]), &values[i]); }
		else { zval_ptr_dtor(&values[i]); }
	}
	return props;
}
/* }}} */

/* {{{ sdl_pixelformat_write_property */
static zval *sdl_pixelformat_write_property(zend_object *object, zend_string *name, zval *value, void **cache_slot)
{
	zend_throw_error(NULL, "Not supported, SDL_PixelFormat is read-only");
	return value;
}
/* }}} */

/* {{{ php_sdl_pixels_free
 */
static void php_sdl_pixels_free(zend_object *object)
{
	php_sdl_pixels *intern = php_sdl_pixels_from_obj(object);

	if (intern->pixels.pixels)
	{
		if (!(intern->flags & SDL_DONTFREE))
		{
			efree(intern->pixels.pixels);
		}
	}

	zval_ptr_dtor(&intern->owner);
	zend_object_std_dtor(&intern->zo);
}
/* }}} */

/* {{{ php_sdl_pixels_new
 */
static zend_object *php_sdl_pixels_new(zend_class_entry *class_type)
{
	php_sdl_pixels *intern = zend_object_alloc(sizeof(php_sdl_pixels), class_type);

	ZVAL_UNDEF(&intern->owner);
	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);

	intern->zo.handlers = (zend_object_handlers *)&php_sdl_pixels_handlers;

	return &intern->zo;
}
/* }}} */

/* {{{ sdl_pixels_read_property*/
zval *sdl_pixels_read_property(zend_object *object, zend_string *member, int type, void **cache_slot, zval *rv)
{
	php_sdl_pixels *intern;
	intern = php_sdl_pixels_from_obj(object);
	char *member_val = ZSTR_VAL(member);

	zval *retval;

	if (!pixels_live(intern, 0)) { ZVAL_NULL(rv); return rv; }

	retval = rv;

	if (!strcmp(member_val, "h"))
	{
		ZVAL_LONG(retval, intern->pixels.h);
	}
	else if (!strcmp(member_val, "pitch"))
	{
		ZVAL_LONG(retval, intern->pixels.pitch);
	}
	else if (!strcmp(member_val, "count"))
	{
		ZVAL_LONG(retval, intern->pixels.pitch * intern->pixels.h);
	}
	else
	{
		retval = zend_std_read_property(object, member, type, cache_slot, rv);

		return retval;
	}

	return retval;
}
/* }}} */

#define SDL_PIXELS_ADD_PROPERTY(n, f) \
	ZVAL_LONG(&zv, f);                \
	zend_hash_str_update(props, n, sizeof(n) - 1, &zv);

/* {{{ sdl_pixels_read_properties */
static HashTable *sdl_pixels_get_properties(zend_object *object)
{
	HashTable *props = zend_std_get_properties(object);
	const char *names[] = {"pitch", "h", "count"};
	zval values[3];
	int count = 0;
	for (unsigned int i = 0; i < sizeof(names) / sizeof(*names); i++) {
		zend_string *name = zend_string_init(names[i], strlen(names[i]), 0);
		ZVAL_UNDEF(&values[i]);
		sdl_pixels_read_property(object, name, BP_VAR_R, NULL, &values[i]);
		zend_string_release(name);
		count++;
		if (EG(exception)) { break; }
	}
	for (int i = 0; i < count; i++) {
		if (!EG(exception)) { zend_hash_str_update(props, names[i], strlen(names[i]), &values[i]); }
		else { zval_ptr_dtor(&values[i]); }
	}
	return props;
}
/* }}} */

/* {{{ sdl_pixels_write_property */
static zval *sdl_pixels_write_property(zend_object *object, zend_string *name, zval *value, void **cache_slot)
{
	zend_throw_error(NULL, "Not supported, SDL_Pixels is read-only");
	return value;
}
/* }}} */

/* {{{ php_sdl_color_methods[] */
static const zend_function_entry php_sdl_color_methods[] = {
	PHP_ME(SDL_Color, __construct, arginfo_SDL_Color__construct, ZEND_ACC_CTOR | ZEND_ACC_PUBLIC)
		PHP_ME(SDL_Color, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)

			PHP_FE_END};
/* }}} */

/* {{{ php_sdl_palette_methods[] */
static const zend_function_entry php_sdl_palette_methods[] = {
	PHP_ME(SDL_Palette, __construct, arginfo_SDL_AllocPalette, ZEND_ACC_PUBLIC)
		PHP_ME(SDL_Palette, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)
			PHP_ME(SDL_Palette, count, arginfo_palette_none, ZEND_ACC_PUBLIC)
				PHP_ME(SDL_Palette, offsetExists, arginfo_SDL_Palette_offsetExists, ZEND_ACC_PUBLIC)
					PHP_ME(SDL_Palette, offsetGet, arginfo_SDL_Palette_offsetGet, ZEND_ACC_PUBLIC)
						PHP_ME(SDL_Palette, offsetSet, arginfo_SDL_Palette_offsetSet, ZEND_ACC_PUBLIC)
							PHP_ME(SDL_Palette, offsetUnset, arginfo_SDL_Palette_offsetUnset, ZEND_ACC_PUBLIC)

	/* non-static methods */
	PHP_FALIAS(Free, SDL_FreePalette, arginfo_palette_none)
		PHP_FALIAS(SetColors, SDL_SetPaletteColors, arginfo_SDL_Palette_SetColors)

			PHP_FE_END};
/* }}} */

/* {{{ php_sdl_pixelformat_methods[] */
static const zend_function_entry php_sdl_pixelformat_methods[] = {
	PHP_ME(SDL_PixelFormat, __construct, arginfo_SDL_AllocFormat, ZEND_ACC_PUBLIC)
		PHP_ME(SDL_PixelFormat, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)
			PHP_ME(SDL_PixelFormat, GetRGB, arginfo_SDL_PixelFormat_GetRGB, ZEND_ACC_PUBLIC)
				PHP_ME(SDL_PixelFormat, GetRGBA, arginfo_SDL_PixelFormat_GetRGBA, ZEND_ACC_PUBLIC)

	/* non-static methods */
	PHP_FALIAS(Free, SDL_FreeFormat, arginfo_format_none)
		PHP_FALIAS(SetPalette, SDL_SetPixelFormatPalette, arginfo_SDL_PixelFormat_SetPalette)
			PHP_FALIAS(MapRGB, SDL_MapRGB, arginfo_SDL_PixelFormat_MapRGB)
				PHP_FALIAS(MapRGBA, SDL_MapRGBA, arginfo_SDL_PixelFormat_MapRGBA)

					PHP_FE_END};
/* }}} */

/* {{{ php_sdl_pixels_methods[] */
static const zend_function_entry php_sdl_pixels_methods[] = {
	PHP_ME(SDL_Pixels, __construct, arginfo_SDL_Pixels__construct, ZEND_ACC_PUBLIC)
		PHP_ME(SDL_Pixels, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)
			PHP_ME(SDL_Pixels, count, arginfo_format_none, ZEND_ACC_PUBLIC)
				PHP_ME(SDL_Pixels, offsetExists, arginfo_SDL_Pixels_offsetExists, ZEND_ACC_PUBLIC)
					PHP_ME(SDL_Pixels, offsetGet, arginfo_SDL_Pixels_offsetGet, ZEND_ACC_PUBLIC)
						PHP_ME(SDL_Pixels, offsetSet, arginfo_SDL_Pixels_offsetSet, ZEND_ACC_PUBLIC)
							PHP_ME(SDL_Pixels, offsetUnset, arginfo_SDL_Pixels_offsetUnset, ZEND_ACC_PUBLIC)
								PHP_ME(SDL_Pixels, GetByte, arginfo_SDL_Pixels_GetByte, ZEND_ACC_PUBLIC)
									PHP_ME(SDL_Pixels, SetByte, arginfo_SDL_Pixels_SetByte, ZEND_ACC_PUBLIC)
										PHP_FE_END};
/* }}} */

#define REGISTER_COLOR_PROP(name) \
	zend_declare_property_long(php_sdl_color_ce, ZEND_STRL(name), 0, ZEND_ACC_PUBLIC)

#define REGISTER_PALETTE_PROP(name) \
	zend_declare_property_long(php_sdl_palette_ce, ZEND_STRL(name), 0, ZEND_ACC_PUBLIC)

#define REGISTER_FORMAT_PROP(name) \
	zend_declare_property_long(php_sdl_pixelformat_ce, ZEND_STRL(name), 0, ZEND_ACC_PUBLIC)

#define REGISTER_PIXELS_PROP(name) \
	zend_declare_property_long(php_sdl_pixels_ce, ZEND_STRL(name), 0, ZEND_ACC_PUBLIC)

/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_pixels)
{
	zend_class_entry ce_color, ce_palette, ce_pixelformat, ce_pixels;

	INIT_CLASS_ENTRY(ce_color, "SDL_Color", php_sdl_color_methods);
	php_sdl_color_ce = zend_register_internal_class(&ce_color);
	memcpy(&php_sdl_color_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));

	REGISTER_COLOR_PROP("r");
	REGISTER_COLOR_PROP("g");
	REGISTER_COLOR_PROP("b");
	REGISTER_COLOR_PROP("a");

	INIT_CLASS_ENTRY(ce_palette, "SDL_Palette", php_sdl_palette_methods);
	php_sdl_palette_ce = zend_register_internal_class(&ce_palette);
	php_sdl_palette_ce->create_object = php_sdl_palette_new;
	zend_class_implements(php_sdl_palette_ce, 1, zend_ce_arrayaccess);
	memcpy(&php_sdl_palette_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_palette_handlers.read_property = sdl_palette_read_property;
	php_sdl_palette_handlers.get_properties = sdl_palette_get_properties;
	php_sdl_palette_handlers.write_property = sdl_palette_write_property;
	php_sdl_palette_handlers.free_obj = php_sdl_palette_free;
	php_sdl_palette_handlers.offset = XtOffsetOf(php_sdl_palette, zo);
	php_sdl_palette_handlers.get_gc = palette_gc;
	php_sdl_palette_handlers.clone_obj = NULL;
	php_sdl_palette_handlers.get_property_ptr_ptr = NULL;
	if (php_sdl_deny_serialization(php_sdl_palette_ce) != SUCCESS) { return FAILURE; }

	REGISTER_PALETTE_PROP("ncolors");
	REGISTER_PALETTE_PROP("version");
	REGISTER_PALETTE_PROP("refcount");
	zend_declare_property_null(php_sdl_palette_ce, ZEND_STRL("colors"), ZEND_ACC_PUBLIC);

	INIT_CLASS_ENTRY(ce_pixelformat, "SDL_PixelFormat", php_sdl_pixelformat_methods);
	php_sdl_pixelformat_ce = zend_register_internal_class(&ce_pixelformat);
	php_sdl_pixelformat_ce->create_object = php_sdl_pixelformat_new;
	memcpy(&php_sdl_pixelformat_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_pixelformat_handlers.read_property = sdl_pixelformat_read_property;
	php_sdl_pixelformat_handlers.get_properties = sdl_pixelformat_get_properties;
	php_sdl_pixelformat_handlers.write_property = sdl_pixelformat_write_property;
	php_sdl_pixelformat_handlers.free_obj = php_sdl_pixelformat_free;
	php_sdl_pixelformat_handlers.offset = XtOffsetOf(php_sdl_pixelformat, zo);
	php_sdl_pixelformat_handlers.get_gc = format_gc;
	php_sdl_pixelformat_handlers.clone_obj = NULL;
	php_sdl_pixelformat_handlers.get_property_ptr_ptr = NULL;
	if (php_sdl_deny_serialization(php_sdl_pixelformat_ce) != SUCCESS) { return FAILURE; }

	REGISTER_FORMAT_PROP("format");
	REGISTER_FORMAT_PROP("BitsPerPixel");
	REGISTER_FORMAT_PROP("BytesPerPixel");
	REGISTER_FORMAT_PROP("Rmask");
	REGISTER_FORMAT_PROP("Gmask");
	REGISTER_FORMAT_PROP("Bmask");
	REGISTER_FORMAT_PROP("Amask");
	REGISTER_FORMAT_PROP("Rloss");
	REGISTER_FORMAT_PROP("Gloss");
	REGISTER_FORMAT_PROP("Bloss");
	REGISTER_FORMAT_PROP("Aloss");
	REGISTER_FORMAT_PROP("Rshift");
	REGISTER_FORMAT_PROP("Gshift");
	REGISTER_FORMAT_PROP("Bshift");
	REGISTER_FORMAT_PROP("Ashift");
	zend_declare_property_null(php_sdl_pixelformat_ce, ZEND_STRL("palette"), ZEND_ACC_PUBLIC);

	INIT_CLASS_ENTRY(ce_pixels, "SDL_Pixels", php_sdl_pixels_methods);
	php_sdl_pixels_ce = zend_register_internal_class(&ce_pixels);
	php_sdl_pixels_ce->create_object = php_sdl_pixels_new;
	zend_class_implements(php_sdl_pixels_ce, 1, zend_ce_arrayaccess);
	memcpy(&php_sdl_pixels_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_pixels_handlers.read_property = sdl_pixels_read_property;
	php_sdl_pixels_handlers.get_properties = sdl_pixels_get_properties;
	php_sdl_pixels_handlers.write_property = sdl_pixels_write_property;
	php_sdl_pixels_handlers.free_obj = php_sdl_pixels_free;
	php_sdl_pixels_handlers.offset = XtOffsetOf(php_sdl_pixels, zo);
	php_sdl_pixels_handlers.get_gc = pixels_gc;
	php_sdl_pixels_handlers.clone_obj = NULL;
	php_sdl_pixels_handlers.get_property_ptr_ptr = NULL;
	if (php_sdl_deny_serialization(php_sdl_pixels_ce) != SUCCESS) { return FAILURE; }

	REGISTER_PIXELS_PROP("pitch");
	REGISTER_PIXELS_PROP("h");
	REGISTER_PIXELS_PROP("count");

	/* Pixel type. */
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_UNKNOWN", SDL_PIXELTYPE_UNKNOWN, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_INDEX1", SDL_PIXELTYPE_INDEX1, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_INDEX4", SDL_PIXELTYPE_INDEX4, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_INDEX8", SDL_PIXELTYPE_INDEX8, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_PACKED8", SDL_PIXELTYPE_PACKED8, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_PACKED16", SDL_PIXELTYPE_PACKED16, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_PACKED32", SDL_PIXELTYPE_PACKED32, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_ARRAYU8", SDL_PIXELTYPE_ARRAYU8, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_ARRAYU16", SDL_PIXELTYPE_ARRAYU16, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_ARRAYU32", SDL_PIXELTYPE_ARRAYU32, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_ARRAYF16", SDL_PIXELTYPE_ARRAYF16, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELTYPE_ARRAYF32", SDL_PIXELTYPE_ARRAYF32, CONST_CS | CONST_PERSISTENT);

	/* Bitmap pixel order, high bit -> low bit. */
	REGISTER_LONG_CONSTANT("SDL_BITMAPORDER_NONE", SDL_BITMAPORDER_NONE, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BITMAPORDER_4321", SDL_BITMAPORDER_4321, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_BITMAPORDER_1234", SDL_BITMAPORDER_1234, CONST_CS | CONST_PERSISTENT);

	/* Packed component order, high bit -> low bit. */
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_NONE", SDL_PACKEDORDER_NONE, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_XRGB", SDL_PACKEDORDER_XRGB, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_RGBX", SDL_PACKEDORDER_RGBX, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_ARGB", SDL_PACKEDORDER_ARGB, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_RGBA", SDL_PACKEDORDER_RGBA, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_XBGR", SDL_PACKEDORDER_XBGR, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_BGRX", SDL_PACKEDORDER_BGRX, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_ABGR", SDL_PACKEDORDER_ABGR, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDORDER_BGRA", SDL_PACKEDORDER_BGRA, CONST_CS | CONST_PERSISTENT);

	/* Packed component layout. */
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_NONE", SDL_PACKEDLAYOUT_NONE, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_332", SDL_PACKEDLAYOUT_332, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_4444", SDL_PACKEDLAYOUT_4444, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_1555", SDL_PACKEDLAYOUT_1555, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_5551", SDL_PACKEDLAYOUT_5551, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_565", SDL_PACKEDLAYOUT_565, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_8888", SDL_PACKEDLAYOUT_8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_2101010", SDL_PACKEDLAYOUT_2101010, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PACKEDLAYOUT_1010102", SDL_PACKEDLAYOUT_1010102, CONST_CS | CONST_PERSISTENT);

	/* Pixel format */
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_UNKNOWN", SDL_PIXELFORMAT_UNKNOWN, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_INDEX1LSB", SDL_PIXELFORMAT_INDEX1LSB, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_INDEX1MSB", SDL_PIXELFORMAT_INDEX1MSB, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_INDEX4LSB", SDL_PIXELFORMAT_INDEX4LSB, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_INDEX4MSB", SDL_PIXELFORMAT_INDEX4MSB, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_INDEX8", SDL_PIXELFORMAT_INDEX8, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGB332", SDL_PIXELFORMAT_RGB332, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGB444", SDL_PIXELFORMAT_RGB444, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGB555", SDL_PIXELFORMAT_RGB555, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGR555", SDL_PIXELFORMAT_BGR555, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ARGB4444", SDL_PIXELFORMAT_ARGB4444, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGBA4444", SDL_PIXELFORMAT_RGBA4444, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ABGR4444", SDL_PIXELFORMAT_ABGR4444, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGRA4444", SDL_PIXELFORMAT_BGRA4444, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ARGB1555", SDL_PIXELFORMAT_ARGB1555, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGBA5551", SDL_PIXELFORMAT_RGBA5551, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ABGR1555", SDL_PIXELFORMAT_ABGR1555, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGRA5551", SDL_PIXELFORMAT_BGRA5551, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGB565", SDL_PIXELFORMAT_RGB565, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGR565", SDL_PIXELFORMAT_BGR565, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGB24", SDL_PIXELFORMAT_RGB24, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGR24", SDL_PIXELFORMAT_BGR24, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGB888", SDL_PIXELFORMAT_RGB888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGBX8888", SDL_PIXELFORMAT_RGBX8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGR888", SDL_PIXELFORMAT_BGR888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGRX8888", SDL_PIXELFORMAT_BGRX8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ARGB8888", SDL_PIXELFORMAT_ARGB8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_RGBA8888", SDL_PIXELFORMAT_RGBA8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ABGR8888", SDL_PIXELFORMAT_ABGR8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_BGRA8888", SDL_PIXELFORMAT_BGRA8888, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_ARGB2101010", SDL_PIXELFORMAT_ARGB2101010, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_YV12", SDL_PIXELFORMAT_YV12, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_IYUV", SDL_PIXELFORMAT_IYUV, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_YUY2", SDL_PIXELFORMAT_YUY2, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_UYVY", SDL_PIXELFORMAT_UYVY, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_PIXELFORMAT_YVYU", SDL_PIXELFORMAT_YVYU, CONST_CS | CONST_PERSISTENT);

	return SUCCESS;
}
/* }}} */
