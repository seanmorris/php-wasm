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

#include "php_sdl.h"
#include "pixels.h"
#include "rect.h"
#include "rwops.h"
#include "surface.h"
#include "php_sdl_extra.h"
#include "zend_interfaces.h"
#include <limits.h>

static zend_class_entry *php_sdl_surface_ce;
static zend_object_handlers php_sdl_surface_handlers;
struct php_sdl_surface
{
	SDL_Surface *surface;
	struct php_sdl_surface *next;
	zend_bool initialized;
	Uint32 flags;
	zend_object zo;
};

static struct php_sdl_surface *surfaces;

/* SDL also frees window surfaces during resize/video shutdown. */
void __real_SDL_FreeSurface(SDL_Surface *surface);
void __wrap_SDL_FreeSurface(SDL_Surface *surface)
{
	if (surface && !(surface->flags & SDL_DONTFREE) && surface->refcount <= 1) {
		for (struct php_sdl_surface *item = surfaces; item; item = item->next) {
			if (item->surface == surface) { item->surface = NULL; }
		}
	}
	__real_SDL_FreeSurface(surface);
}

zend_class_entry *get_php_sdl_surface_ce(void)
{
	return php_sdl_surface_ce;
}

#define FETCH_SURFACE(__ptr, __id, __check)                                                        \
	{                                                                                              \
		zend_object *zox = Z_OBJ_P(__id);                                                          \
		intern = (struct php_sdl_surface *)((char *)zox - zox->handlers->offset);                  \
		__ptr = intern->surface;                                                                   \
		if (__check && !__ptr)                                                                     \
		{                                                                                          \
			zend_throw_error(NULL, "SDL surface has been destroyed"); \
			RETURN_THROWS();                                                                         \
		}                                                                                          \
	}

/* {{{ sdl_surface_to_zval */
zend_bool sdl_surface_to_zval(SDL_Surface *surface, zval *z_val)
{
	if (surface)
	{
		struct php_sdl_surface *intern;

		object_init_ex(z_val, php_sdl_surface_ce);
		zend_object *zo = Z_OBJ_P(z_val);
		intern = (struct php_sdl_surface *)((char *)zo - zo->handlers->offset);
		intern->surface = surface;
		intern->initialized = 1;
		/* copy flags to be able to check before access to surface */
		intern->flags = surface->flags;

		return 1;
	}
	ZVAL_NULL(z_val);
	return 0;
}
/* }}} */

/* {{{ zval_to_sdl_surface */
SDL_Surface *zval_to_sdl_surface(zval *z_val)
{
	struct php_sdl_surface *intern;

	if (Z_TYPE_P(z_val) == IS_OBJECT && instanceof_function(Z_OBJCE_P(z_val), php_sdl_surface_ce))
	{
		zend_object *zo = Z_OBJ_P(z_val);
		intern = (struct php_sdl_surface *)((char *)zo - zo->handlers->offset);
		return intern->surface;
	}
	return NULL;
}
/* }}} */

/* {{{ proto SDL_Surface SDL_CreateRGBSurface(int flags, int width, int height, int depth, int Rmask, int Gmask, int Bmask, int Amask)

 *  Allocate and free an RGB surface.
 *
 *  If the depth is 4 or 8 bits, an empty palette is allocated for the surface.
 *  If the depth is greater than 8 bits, the pixel format is set using the
 *  flags '[RGB]mask'.
 *
 *  If the function runs out of memory, it will return NULL.
 *
 *  \param flags The \c flags are obsolete and should be set to 0.
 *  \param width The width in pixels of the surface to create.
 *  \param height The height in pixels of the surface to create.
 *  \param depth The depth in bits of the surface to create.
 *  \param Rmask The red mask of the surface to create.
 *  \param Gmask The green mask of the surface to create.
 *  \param Bmask The blue mask of the surface to create.
 *  \param Amask The alpha mask of the surface to create.
 extern DECLSPEC SDL_Surface *SDLCALL SDL_CreateRGBSurface
	 (Uint32 flags, int width, int height, int depth,
	  Uint32 Rmask, Uint32 Gmask, Uint32 Bmask, Uint32 Amask);
*/
PHP_FUNCTION(SDL_CreateRGBSurface)
{
	zend_long flags, width, height, depth, rmask, gmask, bmask, amask;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "llllllll", &flags, &width, &height, &depth, &rmask, &gmask, &bmask, &amask))
	{
		return;
	}
	surface = SDL_CreateRGBSurface(flags, (int)width, (int)height, (int)depth, rmask, gmask, bmask, amask);
	sdl_surface_to_zval(surface, return_value);
}
/* }}} */

/* {{{ proto SDL_Surface SDL_LoadBMP_RW(SDL_RWops src, int freesrc)

 *  Load a surface from a seekable SDL data stream (memory or file).
 *
 *  If \c freesrc is non-zero, the stream will be closed after being read.
 *
 *  The new surface should be freed with SDL_FreeSurface().
 *
 *  \return the new surface, or NULL if there was an error.
 extern DECLSPEC SDL_Surface *SDLCALL SDL_LoadBMP_RW(SDL_RWops * src,
													 int freesrc);
 */
PHP_FUNCTION(SDL_LoadBMP_RW)
{
	zval *value, owner; zend_long freesrc;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, get_php_sdl_rwops_ce(), &freesrc) == FAILURE) { RETURN_THROWS(); }
	ZVAL_COPY_DEREF(&owner, value);
	SDL_RWops *rwops = zval_to_sdl_rwops(&owner);
	if (!rwops) { zval_ptr_dtor(&owner); RETURN_THROWS(); }
	SDL_Surface *surface = SDL_LoadBMP_RW(rwops, 0);
	if (freesrc) { php_sdl_rwops_close(&owner); }
	zval_ptr_dtor(&owner);
	if (EG(exception)) { SDL_FreeSurface(surface); RETURN_THROWS(); }
	sdl_surface_to_zval(surface, return_value);
}
/* }}} */

/* {{{ proto SDL_Surface SDL_LoadBMP(string file)

	PHP note: stream are supported

 *  Load a surface from a file.
 *
 *  Convenience macro.
 define SDL_LoadBMP(file)   SDL_LoadBMP_RW(SDL_RWFromFile(file, "rb"), 1)
 */
PHP_FUNCTION(SDL_LoadBMP)
{
	char *path;
	size_t path_len;
	SDL_Surface *surface = NULL;

	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "s", &path, &path_len))
	{
		return;
	}

	surface = SDL_LoadBMP(path);

	sdl_surface_to_zval(surface, return_value);
}
/* }}} */

/* {{{ proto SDL_Surface::__construct(int flags, int width, int height, int depth, int Rmask, int Gmask, int Bmask, int Amask) */
static PHP_METHOD(SDL_Surface, __construct)
{
	struct php_sdl_surface *intern;
	zend_long flags, width, height, depth, rmask, gmask, bmask, amask;
	zend_error_handling error_handling;

	zend_object *zo = Z_OBJ_P(getThis());
	intern = (struct php_sdl_surface *)((char *)zo - zo->handlers->offset);

	zend_replace_error_handling(EH_THROW, NULL, &error_handling);
	if (FAILURE == zend_parse_parameters(ZEND_NUM_ARGS(), "llllllll", &flags, &width, &height, &depth, &rmask, &gmask, &bmask, &amask))
	{
		zend_restore_error_handling(&error_handling);
		return;
	}
	zend_restore_error_handling(&error_handling);

	if (intern->initialized) { zend_throw_error(NULL, "SDL surface is already initialized"); RETURN_THROWS(); }
	intern->initialized = 1;
	intern->surface = SDL_CreateRGBSurface(flags, (int)width, (int)height, (int)depth, rmask, gmask, bmask, amask);
	if (intern->surface)
	{
		/* copy flags to be able to check before access to surface */
		intern->flags = intern->surface->flags;
	}
	else
	{
		zend_throw_exception(zend_ce_exception, SDL_GetError(), 0);
	}
}
/* }}} */

/* {{{ proto SDL_Surface::__toString() */
static PHP_METHOD(SDL_Surface, __toString)
{
	struct php_sdl_surface *intern;
	char *buf;
	size_t buf_len;

	if (zend_parse_parameters_none() == FAILURE)
	{
		return;
	}

	zend_object *zo = Z_OBJ_P(getThis());
	intern = (struct php_sdl_surface *)((char *)zo - zo->handlers->offset);

	if (intern->surface)
	{
		buf_len = spprintf(&buf, 100, "SDL_Surface(%u,%d,%d,%u,0x%x,0x%x,0x%x,0x%x)",
						   intern->surface->flags, intern->surface->w, intern->surface->h,
						   intern->surface->format->BitsPerPixel, intern->surface->format->Rmask,
						   intern->surface->format->Gmask, intern->surface->format->Bmask, intern->surface->format->Amask);
		RETVAL_STRINGL(buf, buf_len);
		efree(buf);
	}
	else
	{
		RETVAL_STRING("SDL_Surface()");
	}
}
/* }}} */

/* {{{ proto int SDL_SaveBMP_RW(SDL_Surface surface, SDL_RWops &dst, int freedst)

 *  Save a surface to a seekable SDL data stream (memory or file).
 *
 *  If \c freedst is non-zero, the stream will be closed after being written.
 *
 *  \return 0 if successful or -1 if there was an error.
 extern DECLSPEC int SDLCALL SDL_SaveBMP_RW
	 (SDL_Surface * surface, SDL_RWops * dst, int freedst);
 */
static int surface_save_bmp(zval *value, zval *destination)
{
	SDL_RWops *rwops = zval_to_sdl_rwops(destination);
	if (!rwops) { return -1; }
	SDL_Surface *surface = zval_to_sdl_surface(value);
	if (!surface) { zend_throw_error(NULL, "SDL surface has been destroyed"); return -1; }
	SDL_Surface *copy = SDL_DuplicateSurface(surface);
	if (!copy) { return -1; }
	int result = SDL_SaveBMP_RW(copy, rwops, 0);
	SDL_FreeSurface(copy);
	if (!EG(exception)) { php_sdl_rwops_flush(destination); }
	return result;
}

PHP_FUNCTION(SDL_SaveBMP_RW)
{
	zval *surface, *destination, owner; zend_long freedst = 0;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO|l", &surface, php_sdl_surface_ce,
		&destination, get_php_sdl_rwops_ce(), &freedst) == FAILURE) { RETURN_THROWS(); }
	ZVAL_COPY_DEREF(&owner, destination);
	int result = surface_save_bmp(surface, &owner);
	if (freedst) { php_sdl_rwops_close(&owner); }
	zval_ptr_dtor(&owner);
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */

/* {{{ proto int SDL_SaveBMP(SDL_Surface surface, string path)

	PHP note: PHP file and memory streams are supported

 define SDL_SaveBMP(surface, file) \
		 SDL_SaveBMP_RW(surface, SDL_RWFromFile(file, "wb"), 1)

 */
PHP_FUNCTION(SDL_SaveBMP)
{
	zval *surface, owner; char *path; size_t length;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Op", &surface, php_sdl_surface_ce, &path, &length) == FAILURE) { RETURN_THROWS(); }
	php_stream *stream = php_stream_open_wrapper(path, "wb", REPORT_ERRORS, NULL);
	if (!stream) { if (EG(exception)) { RETURN_THROWS(); } RETURN_LONG(-1); }
	php_stream_to_zval_rwops(stream, &owner, 1);
	/* Transfer the opening reference to the wrapper, including on failure. */
	zend_list_delete(stream->res);
	if (Z_TYPE(owner) != IS_OBJECT) { RETURN_LONG(-1); }
	int result = EG(exception) ? -1 : surface_save_bmp(surface, &owner);
	php_sdl_rwops_close(&owner);
	zval_ptr_dtor(&owner);
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */

/* {{{ proto void SDL_FreeSurface(SDL_Surface surface)

 *  \brief Destroy a window.
 extern DECLSPEC void SDLCALL SDL_FreeSurface(SDL_Surface * surface);
 */
PHP_FUNCTION(SDL_FreeSurface)
{
	zval *value;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_surface_ce) == FAILURE) { RETURN_THROWS(); }
	struct php_sdl_surface *intern = (struct php_sdl_surface *)((char *)Z_OBJ_P(value) - Z_OBJ_HT_P(value)->offset);
	SDL_Surface *surface = intern->surface;
	if (!surface) { return; }
	if (intern->flags & SDL_DONTFREE) { zend_throw_error(NULL, "window owns this surface; destroy the window instead"); RETURN_THROWS(); }
	intern->surface = NULL;
	SDL_FreeSurface(surface);
}
/* }}} */

/* {{{ proto SDL_FillRect(SDL_Surface surface, SDL_Rect rect, int color)

 *  Performs a fast fill of the given rectangle with \c color.
 *
 *  If \c rect is NULL, the whole surface will be filled with \c color.
 *
 *  The color should be a pixel of the format used by the surface, and
 *  can be generated by the SDL_MapRGB() function.
 *
 *  \return 0 on success, or -1 on error.
extern DECLSPEC int SDLCALL SDL_FillRect
	(SDL_Surface * dst, const SDL_Rect * rect, Uint32 color);
 */
PHP_FUNCTION(SDL_FillRect)
{
	zval *value, *rectangle; zend_long color; SDL_Rect rect;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO!l", &value, php_sdl_surface_ce, &rectangle, get_php_sdl_rect_ce(), &color) == FAILURE) { RETURN_THROWS(); }
	if (rectangle && !php_sdl_read_rect(rectangle, &rect)) { RETURN_THROWS(); }
	SDL_Surface *surface = zval_to_sdl_surface(value);
	if (!surface) { zend_throw_error(NULL, "SDL surface has been destroyed"); RETURN_THROWS(); }
	RETURN_LONG(SDL_FillRect(surface, rectangle ? &rect : NULL, color));
}
/* }}} */

/* {{{ proto int SDL_FillRects(SDL_Surface surface, SDL_Rect rect, int count, int color)

extern DECLSPEC int SDLCALL SDL_FillRects
	(SDL_Surface * dst, const SDL_Rect * rects, int count, Uint32 color);
*/
PHP_FUNCTION(SDL_FillRects)
{
	zval *value, *array; zend_long count, color;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oall", &value, php_sdl_surface_ce, &array, &count, &color) == FAILURE) { RETURN_THROWS(); }
	zend_long length = zend_hash_num_elements(Z_ARRVAL_P(array));
	if (!count) { count = length; }
	if (count < 0 || count > length || count > INT_MAX / (int)sizeof(SDL_Rect)) {
		zend_value_error("rectangle count must fit the array and int32 storage"); RETURN_THROWS();
	}
	SDL_Rect *rects = safe_emalloc(count, sizeof(SDL_Rect), 0);
	zval snapshot; ZVAL_COPY(&snapshot, array);
	for (zend_long i = 0; i < count; i++) {
		zval *rect = zend_hash_index_find(Z_ARRVAL(snapshot), i);
		if (!rect) { zend_value_error("rectangles must contain consecutive indices from zero"); }
		if (!rect || !php_sdl_read_rect(rect, &rects[i])) { break; }
	}
	zval_ptr_dtor(&snapshot);
	if (EG(exception)) { efree(rects); RETURN_THROWS(); }
	SDL_Surface *surface = zval_to_sdl_surface(value);
	if (!surface) { efree(rects); zend_throw_error(NULL, "SDL surface has been destroyed"); RETURN_THROWS(); }
	int result = count ? SDL_FillRects(surface, rects, count, color) : 0;
	efree(rects); RETURN_LONG(result);
}
/* }}} */

/* {{{ proto bool SDL_MUSTLOCK(SDL_Surface surface)

 *  Evaluates to true if the surface needs to be locked before access.
 define SDL_MUSTLOCK(S) (((S)->flags & SDL_RLEACCEL) != 0)
 */
PHP_FUNCTION(SDL_MUSTLOCK)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_surface, php_sdl_surface_ce))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);

	RETURN_BOOL(SDL_MUSTLOCK(surface));
}
/* }}} */

/* {{{ proto int SDL_LockSurface(SDL_Surface surface)

 *  \brief Sets up a surface for directly accessing the pixels.
 *
 *  Between calls to SDL_LockSurface() / SDL_UnlockSurface(), you can write
 *  to and read from \c surface->pixels, using the pixel format stored in
 *  \c surface->format.  Once you are done accessing the surface, you should
 *  use SDL_UnlockSurface() to release it.
 *
 *  Not all surfaces require locking.  If SDL_MUSTLOCK(surface) evaluates
 *  to 0, then you can read and write to the surface at any time, and the
 *  pixel format of the surface will not change.
 *
 *  No operating system or library calls should be made between lock/unlock
 *  pairs, as critical system locks may be held during this time.
 *
 *  SDL_LockSurface() returns 0, or -1 if the surface couldn't be locked.
 *  \sa SDL_UnlockSurface()
 *  \sa SDL_LockSurface()
 extern DECLSPEC int SDLCALL SDL_LockSurface(SDL_Surface * surface);
 */
PHP_FUNCTION(SDL_LockSurface)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_surface, php_sdl_surface_ce))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);

	RETURN_LONG(SDL_LockSurface(surface));
}
/* }}} */

/* {{{ proto void SDL_UnlockSurface(SDL_Surface surface)

extern DECLSPEC void SDLCALL SDL_UnlockSurface(SDL_Surface * surface);
*/
PHP_FUNCTION(SDL_UnlockSurface)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_surface, php_sdl_surface_ce))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);

	SDL_UnlockSurface(surface);
}
/* }}} */

/* {{{ proto void SDL_UpperBlit(SDL_Surface src, SDL_rect &srcrect, SDL_Surface dst [, SDL_rect &dstrect])

 *  Performs a fast blit from the source surface to the destination surface.
 *
 *  This assumes that the source and destination rectangles are
 *  the same size.  If either \c srcrect or \c dstrect are NULL, the entire
 *  surface (\c src or \c dst) is copied.  The final blit rectangles are saved
 *  in \c srcrect and \c dstrect after all clipping is performed.
 *
 *  \return If the blit is successful, it returns 0, otherwise it returns -1.
 *
 *  The blit function should not be called on a locked surface.
 *
 *  The blit semantics for surfaces with and without blending and colorkey
 *  are defined as follows:
 *  \verbatim
	RGBA->RGB:
	  Source surface blend mode set to SDL_BLENDMODE_BLEND:
		alpha-blend (using the source alpha-channel and per-surface alpha)
		SDL_SRCCOLORKEY ignored.
	  Source surface blend mode set to SDL_BLENDMODE_NONE:
		copy RGB.
		if SDL_SRCCOLORKEY set, only copy the pixels matching the
		RGB values of the source color key, ignoring alpha in the
		comparison.

	RGB->RGBA:
	  Source surface blend mode set to SDL_BLENDMODE_BLEND:
		alpha-blend (using the source per-surface alpha)
	  Source surface blend mode set to SDL_BLENDMODE_NONE:
		copy RGB, set destination alpha to source per-surface alpha value.
	  both:
		if SDL_SRCCOLORKEY set, only copy the pixels matching the
		source color key.

	RGBA->RGBA:
	  Source surface blend mode set to SDL_BLENDMODE_BLEND:
		alpha-blend (using the source alpha-channel and per-surface alpha)
		SDL_SRCCOLORKEY ignored.
	  Source surface blend mode set to SDL_BLENDMODE_NONE:
		copy all of RGBA to the destination.
		if SDL_SRCCOLORKEY set, only copy the pixels matching the
		RGB values of the source color key, ignoring alpha in the
		comparison.

	RGB->RGB:
	  Source surface blend mode set to SDL_BLENDMODE_BLEND:
		alpha-blend (using the source per-surface alpha)
	  Source surface blend mode set to SDL_BLENDMODE_NONE:
		copy RGB.
	  both:
		if SDL_SRCCOLORKEY set, only copy the pixels matching the
		source color key.
	\endverbatim

 *
 *  You should call SDL_BlitSurface() unless you know exactly how SDL
 *  blitting works internally and how to use the other blit functions.
 define SDL_BlitSurface SDL_UpperBlit

 *  This is the public blit function, SDL_BlitSurface(), and it performs
 *  rectangle validation and clipping before passing it to SDL_LowerBlit()
 extern DECLSPEC int SDLCALL SDL_UpperBlit
	 (SDL_Surface * src, const SDL_Rect * srcrect,
	  SDL_Surface * dst, SDL_Rect * dstrect);
 */
static zend_bool surface_contains(SDL_Surface *surface, const SDL_Rect *rect)
{
	return rect->x >= 0 && rect->y >= 0 && rect->w > 0 && rect->h > 0
		&& rect->x <= surface->w && rect->y <= surface->h
		&& rect->w <= surface->w - rect->x && rect->h <= surface->h - rect->y;
}

static void surface_blit(INTERNAL_FUNCTION_PARAMETERS, int operation)
{
	zval *source, *destination, *source_rect, *destination_rect = NULL;
	SDL_Rect src_rect, dst_rect;
	zend_bool lower = operation == 1 || operation == 3;
	if (lower) {
		if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OOOO", &source, php_sdl_surface_ce,
			&source_rect, get_php_sdl_rect_ce(), &destination, php_sdl_surface_ce,
			&destination_rect, get_php_sdl_rect_ce()) == FAILURE) { RETURN_THROWS(); }
	} else {
		if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OzO|z", &source, php_sdl_surface_ce,
			&source_rect, &destination, php_sdl_surface_ce, &destination_rect) == FAILURE) { RETURN_THROWS(); }
	}
	ZVAL_DEREF(source_rect);
	if (destination_rect) { ZVAL_DEREF(destination_rect); }
	zend_bool has_src = Z_TYPE_P(source_rect) != IS_NULL;
	zend_bool has_dst = destination_rect && Z_TYPE_P(destination_rect) != IS_NULL;
	if ((has_src && !php_sdl_read_rect(source_rect, &src_rect))
		|| (has_dst && !php_sdl_read_rect(destination_rect, &dst_rect))) { RETURN_THROWS(); }
	SDL_Surface *src = zval_to_sdl_surface(source), *dst = zval_to_sdl_surface(destination);
	if (!src || !dst) { zend_throw_error(NULL, "SDL surface has been destroyed"); RETURN_THROWS(); }
	if (lower && (!surface_contains(src, &src_rect) || !surface_contains(dst, &dst_rect)
		|| (operation == 1 && (src_rect.w != dst_rect.w || src_rect.h != dst_rect.h)))) {
		zend_value_error("lower blit rectangles must fit their surfaces; unscaled dimensions must match"); RETURN_THROWS();
	}
	SDL_Rect *sr = has_src ? &src_rect : NULL, *dr = has_dst ? &dst_rect : NULL;
	int result;
	switch (operation) {
		case 0: result = SDL_UpperBlit(src, sr, dst, dr); break;
		case 1: result = SDL_LowerBlit(src, sr, dst, dr); break;
		case 2: result = SDL_UpperBlitScaled(src, sr, dst, dr); break;
		case 3: result = SDL_LowerBlitScaled(src, sr, dst, dr); break;
		default: result = SDL_SoftStretch(src, sr, dst, dr); break;
	}
	if (result == 0 && operation != 4) {
		if (lower && !php_sdl_write_rect(source_rect, &src_rect)) { RETURN_THROWS(); }
		if (has_dst && !php_sdl_write_rect(destination_rect, &dst_rect)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_UpperBlit)
{
	surface_blit(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0);
}
/* }}} */

/* {{{ proto void SDL_LowerBlit(SDL_Surface src, SDL_rect &srcrect, SDL_Surface dst , SDL_rect &dstrect)

 *  This is a semi-private blit function and it performs low-level surface
 *  blitting only.
 extern DECLSPEC int SDLCALL SDL_LowerBlit
	 (SDL_Surface * src, SDL_Rect * srcrect,
	  SDL_Surface * dst, SDL_Rect * dstrect);
 */
PHP_FUNCTION(SDL_LowerBlit)
{
	surface_blit(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1);
}
/* }}} */

/* {{{ proto void SDL_UpperBlitScaled(SDL_Surface src, SDL_rect &srcrect, SDL_Surface dst [, SDL_rect &dstrect])

 *  This is the public scaled blit function, SDL_BlitScaled(), and it performs
 *  rectangle validation and clipping before passing it to SDL_LowerBlitScaled()
 extern DECLSPEC int SDLCALL SDL_UpperBlitScaled
	 (SDL_Surface * src, const SDL_Rect * srcrect,
	 SDL_Surface * dst, SDL_Rect * dstrect);
 define SDL_BlitScaled SDL_UpperBlitScaled
 */
PHP_FUNCTION(SDL_UpperBlitScaled)
{
	surface_blit(INTERNAL_FUNCTION_PARAM_PASSTHRU, 2);
}
/* }}} */

/* {{{ proto void SDL_LowerBlitScaled(SDL_Surface src, SDL_rect &srcrect, SDL_Surface dst , SDL_rect &dstrect)

 *  This is a semi-private blit function and it performs low-level surface
 *  scaled blitting only.
 extern DECLSPEC int SDLCALL SDL_LowerBlitScaled
	 (SDL_Surface * src, SDL_Rect * srcrect,
	 SDL_Surface * dst, SDL_Rect * dstrect);
 */
PHP_FUNCTION(SDL_LowerBlitScaled)
{
	surface_blit(INTERNAL_FUNCTION_PARAM_PASSTHRU, 3);
}
/* }}} */

/* {{{ proto void SDL_SoftStretch(SDL_Surface src, SDL_rect srcrect, SDL_Surface dst [, SDL_rect dstrect])

 *  \brief Perform a fast, low quality, stretch blit between two surfaces of the
 *         same pixel format.
 *
 *  \note This function uses a static buffer, and is not thread-safe.
 extern DECLSPEC int SDLCALL SDL_SoftStretch(SDL_Surface * src,
											 const SDL_Rect * srcrect,
											 SDL_Surface * dst,
											 const SDL_Rect * dstrect);

 */
PHP_FUNCTION(SDL_SoftStretch)
{
	surface_blit(INTERNAL_FUNCTION_PARAM_PASSTHRU, 4);
}
/* }}} */

/* {{{ proto void SDL_SetSurfaceRLE(SDL_Surface src, int flag)

 *  \brief Sets the RLE acceleration hint for a surface.
 *
 *  \return 0 on success, or -1 if the surface is not valid
 *
 *  \note If RLE is enabled, colorkey and alpha blending blits are much faster,
 *        but the surface must be locked before directly accessing the pixels.
 extern DECLSPEC int SDLCALL SDL_SetSurfaceRLE(SDL_Surface * surface,
											   int flag);
 */
PHP_FUNCTION(SDL_SetSurfaceRLE)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	zend_long flag;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_surface, php_sdl_surface_ce, &flag))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	RETURN_LONG(SDL_SetSurfaceRLE(surface, (int)flag));
}
/* }}} */

/* {{{ proto int SDL_SetColorKey(SDL_Surface src, int flag [, int key ])

 *  \brief Sets the color key (transparent pixel) in a blittable surface.
 *
 *  \param surface The surface to update
 *  \param flag Non-zero to enable colorkey and 0 to disable colorkey
 *  \param key The transparent pixel in the native surface format
 *
 *  \return 0 on success, or -1 if the surface is not valid
 *
 *  You can pass SDL_RLEACCEL to enable RLE accelerated blits.
 extern DECLSPEC int SDLCALL SDL_SetColorKey(SDL_Surface * surface,
											 int flag, Uint32 key);
 */
PHP_FUNCTION(SDL_SetColorKey)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	bool flag;
	zend_long key = 0;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ob|l", &z_surface, php_sdl_surface_ce, &flag, &key))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	RETURN_LONG(SDL_SetColorKey(surface, flag ? SDL_TRUE : SDL_FALSE, (Uint32)key));
}
/* }}} */

/* {{{ proto int SDL_GetColorKey(SDL_Surface src, int &key)

 *  \brief Gets the color key (transparent pixel) in a blittable surface.
 *
 *  \param surface The surface to update
 *  \param key A pointer filled in with the transparent pixel in the native
 *             surface format
 *
 *  \return 0 on success, or -1 if the surface is not valid or colorkey is not
 *          enabled.
 extern DECLSPEC int SDLCALL SDL_GetColorKey(SDL_Surface * surface,
											 Uint32 * key);
 */
PHP_FUNCTION(SDL_GetColorKey)
{
	struct php_sdl_surface *intern;
	zval *z_surface, *z_key;
	Uint32 key;
	SDL_Surface *surface;
	int result;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oz", &z_surface, php_sdl_surface_ce, &z_key))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	result = SDL_GetColorKey(surface, &key);
	if (result == 0)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_key, key);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}
/* }}} */

/* {{{ proto int SDL_SetSurfaceColorMod(SDL_Surface src, int r, int g, int b)

 *  \brief Set an additional color value used in blit operations.
 *
 *  \param surface The surface to update.
 *  \param r The red color value multiplied into blit operations.
 *  \param g The green color value multiplied into blit operations.
 *  \param b The blue color value multiplied into blit operations.
 *
 *  \return 0 on success, or -1 if the surface is not valid.
 *
 *  \sa SDL_GetSurfaceColorMod()
 extern DECLSPEC int SDLCALL SDL_SetSurfaceColorMod(SDL_Surface * surface,
													Uint8 r, Uint8 g, Uint8 b);
 */
PHP_FUNCTION(SDL_SetSurfaceColorMod)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	zend_long r, g, b;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Olll", &z_surface, php_sdl_surface_ce, &r, &g, &b))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	RETURN_LONG(SDL_SetSurfaceColorMod(surface, (Uint8)r, (Uint8)g, (Uint8)b));
}
/* }}} */

/* {{{ proto int SDL_GetSurfaceColorMod(SDL_Surface src, int &r, int &g, int&b)

 *  \brief Get the additional color value used in blit operations.
 *
 *  \param surface The surface to query.
 *  \param r A pointer filled in with the current red color value.
 *  \param g A pointer filled in with the current green color value.
 *  \param b A pointer filled in with the current blue color value.
 *
 *  \return 0 on success, or -1 if the surface is not valid.
 *
 *  \sa SDL_SetSurfaceColorMod()
 extern DECLSPEC int SDLCALL SDL_GetSurfaceColorMod(SDL_Surface * surface,
													Uint8 * r, Uint8 * g,
													Uint8 * b);
 */
PHP_FUNCTION(SDL_GetSurfaceColorMod)
{
	struct php_sdl_surface *intern;
	zval *z_surface, *z_r, *z_g, *z_b;
	Uint8 r, g, b;
	SDL_Surface *surface;
	int result;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ozzz", &z_surface, php_sdl_surface_ce, &z_r, &z_g, &z_b))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	result = SDL_GetSurfaceColorMod(surface, &r, &g, &b);
	if (result == 0)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_r, r);
		if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_g, g);
		if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(z_b, b);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}
/* }}} */

/* {{{ proto int SDL_SetSurfaceColorMod(SDL_Surface src, int alpha)

 *  \brief Set an additional alpha value used in blit operations.
 *
 *  \param surface The surface to update.
 *  \param alpha The alpha value multiplied into blit operations.
 *
 *  \return 0 on success, or -1 if the surface is not valid.
 *
 *  \sa SDL_GetSurfaceAlphaMod()
 extern DECLSPEC int SDLCALL SDL_SetSurfaceAlphaMod(SDL_Surface * surface,
													Uint8 alpha);
 */
PHP_FUNCTION(SDL_SetSurfaceAlphaMod)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	zend_long a;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_surface, php_sdl_surface_ce, &a))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	RETURN_LONG(SDL_SetSurfaceAlphaMod(surface, (Uint8)a));
}
/* }}} */

/* {{{ proto int SDL_GetSurfaceAlphaMod(SDL_Surface src, int &a)

 *  \brief Get the additional alpha value used in blit operations.
 *
 *  \param surface The surface to query.
 *  \param alpha A pointer filled in with the current alpha value.
 *
 *  \return 0 on success, or -1 if the surface is not valid.
 *
 *  \sa SDL_SetSurfaceAlphaMod()
 extern DECLSPEC int SDLCALL SDL_GetSurfaceAlphaMod(SDL_Surface * surface,
													Uint8 * alpha);
 */
PHP_FUNCTION(SDL_GetSurfaceAlphaMod)
{
	struct php_sdl_surface *intern;
	zval *z_surface, *z_a;
	Uint8 a;
	SDL_Surface *surface;
	int result;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oz", &z_surface, php_sdl_surface_ce, &z_a))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	result = SDL_GetSurfaceAlphaMod(surface, &a);
	if (result == 0)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_a, a);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}
/* }}} */

/* {{{ proto int SDL_SetSurfaceBlendMode(SDL_Surface src, int blendmode)
 *  \brief Set the blend mode used for blit operations.
 *
 *  \param surface The surface to update.
 *  \param blendMode ::SDL_BlendMode to use for blit blending.
 *
 *  \return 0 on success, or -1 if the parameters are not valid.
 *
 *  \sa SDL_GetSurfaceBlendMode()
 extern DECLSPEC int SDLCALL SDL_SetSurfaceBlendMode(SDL_Surface * surface,
													 SDL_BlendMode blendMode);
 */
PHP_FUNCTION(SDL_SetSurfaceBlendMode)
{
	struct php_sdl_surface *intern;
	zval *z_surface;
	zend_long mode;
	SDL_Surface *surface;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_surface, php_sdl_surface_ce, &mode))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	RETURN_LONG(SDL_SetSurfaceBlendMode(surface, (SDL_BlendMode)mode));
}
/* }}} */

/* {{{ proto int SDL_GetSurfaceAlphaMod(SDL_Surface src, int &a)

 *  \brief Get the blend mode used for blit operations.
 *
 *  \param surface   The surface to query.
 *  \param blendMode A pointer filled in with the current blend mode.
 *
 *  \return 0 on success, or -1 if the surface is not valid.
 *
 *  \sa SDL_SetSurfaceBlendMode()
 extern DECLSPEC int SDLCALL SDL_GetSurfaceBlendMode(SDL_Surface * surface,
													 SDL_BlendMode *blendMode);
 */
PHP_FUNCTION(SDL_GetSurfaceBlendMode)
{
	struct php_sdl_surface *intern;
	zval *z_surface, *z_mode;
	SDL_BlendMode mode;
	SDL_Surface *surface;
	int result;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oz", &z_surface, php_sdl_surface_ce, &z_mode))
	{
		return;
	}
	FETCH_SURFACE(surface, z_surface, 1);
	result = SDL_GetSurfaceBlendMode(surface, &mode);
	if (result == 0)
	{
		ZEND_TRY_ASSIGN_REF_LONG(z_mode, mode);
		if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}
/* }}} */

/* {{{ proto void SDL_SetClipRect(SDL_Surface src, SDL_Rect cliprect)

 *  Sets the clipping rectangle for the destination surface in a blit.
 *
 *  If the clip rectangle is NULL, clipping will be disabled.
 *
 *  If the clip rectangle doesn't intersect the surface, the function will
 *  return SDL_FALSE and blits will be completely clipped.  Otherwise the
 *  function returns SDL_TRUE and blits to the surface will be clipped to
 *  the intersection of the surface area and the clipping rectangle.
 *
 *  Note that blits are automatically clipped to the edges of the source
 *  and destination surfaces.
 extern DECLSPEC SDL_bool SDLCALL SDL_SetClipRect(SDL_Surface * surface,
												  const SDL_Rect * rect);
 */
PHP_FUNCTION(SDL_SetClipRect)
{
	zval *value, *rectangle; SDL_Rect rect;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO!", &value, php_sdl_surface_ce, &rectangle, get_php_sdl_rect_ce()) == FAILURE) { RETURN_THROWS(); }
	if (rectangle && !php_sdl_read_rect(rectangle, &rect)) { RETURN_THROWS(); }
	SDL_Surface *surface = zval_to_sdl_surface(value);
	if (!surface) { zend_throw_error(NULL, "SDL surface has been destroyed"); RETURN_THROWS(); }
	RETURN_BOOL(SDL_SetClipRect(surface, rectangle ? &rect : NULL));
}
/* }}} */

/* {{{ proto void SDL_GetClipRect(SDL_Surface src, SDL_Rect &rect)

 *  Gets the clipping rectangle for the destination surface in a blit.
 *
 *  \c rect must be a pointer to a valid rectangle which will be filled
 *  with the correct values.
 extern DECLSPEC void SDLCALL SDL_GetClipRect(SDL_Surface * surface,
											  SDL_Rect * rect);
 */
PHP_FUNCTION(SDL_GetClipRect)
{
	zval *value, *output, rectangle; SDL_Rect rect;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oz", &value, php_sdl_surface_ce, &output) == FAILURE) { RETURN_THROWS(); }
	SDL_Surface *surface = zval_to_sdl_surface(value);
	if (!surface) { zend_throw_error(NULL, "SDL surface has been destroyed"); RETURN_THROWS(); }
	SDL_GetClipRect(surface, &rect);
	sdl_rect_to_zval(&rect, &rectangle);
	ZEND_TRY_ASSIGN_REF_COPY(output, &rectangle);
	zval_ptr_dtor(&rectangle);
	if (EG(exception)) { RETURN_THROWS(); }
}
/* }}} */

/* {{{ proto void SDL_ConvertSurface(SDL_Surface src, SDL_PixelFormat format, int flag)

 *  Creates a new surface of the specified format, and then copies and maps
 *  the given surface to it so the blit of the converted surface will be as
 *  fast as possible.  If this function fails, it returns NULL.
 *
 *  The \c flags parameter is passed to SDL_CreateRGBSurface() and has those
 *  semantics.  You can also pass ::SDL_RLEACCEL in the flags parameter and
 *  SDL will try to RLE accelerate colorkey and alpha blits in the resulting
 *  surface.
 extern DECLSPEC SDL_Surface *SDLCALL SDL_ConvertSurface
	 (SDL_Surface * src, const SDL_PixelFormat * fmt, Uint32 flags);
 */
PHP_FUNCTION(SDL_ConvertSurface)
{
	struct php_sdl_surface *intern;
	zval *z_src, *z_format;
	zend_long flags = 0;
	SDL_Surface *src, *dst;
	SDL_PixelFormat *format;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "OO|l", &z_src, php_sdl_surface_ce, &z_format, get_php_sdl_pixelformat_ce(), &flags))
	{
		return;
	}
	FETCH_SURFACE(src, z_src, 1);
	format = zval_to_sdl_pixelformat(z_format);
	if (format)
	{
		dst = SDL_ConvertSurface(src, format, (Uint32)flags);
		sdl_surface_to_zval(dst, return_value);
	}
	else
	{
		RETVAL_NULL();
	}
}
/* }}} */

/* {{{ proto void SDL_ConvertSurfaceFormat(SDL_Surface src, int format [, int flags])

 extern DECLSPEC SDL_Surface *SDLCALL SDL_ConvertSurfaceFormat
	 (SDL_Surface * src, Uint32 pixel_format, Uint32 flags);
 */
PHP_FUNCTION(SDL_ConvertSurfaceFormat)
{
	struct php_sdl_surface *intern;
	zval *z_src;
	zend_long format, flags = 0;
	SDL_Surface *src, *dst;

	if (FAILURE == zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol|l", &z_src, php_sdl_surface_ce, &format, &flags))
	{
		return;
	}
	FETCH_SURFACE(src, z_src, 1);
	dst = SDL_ConvertSurfaceFormat(src, (Uint32)format, (Uint32)flags);
	sdl_surface_to_zval(dst, return_value);
}
/* }}} */

/* {{{ proto int SDL_ConvertPixels(int width, int height, int src_format, SDL_Pixels src, int src_pitch, int dst_format, SDL_Pixels dst, int dst_pitch)

 * \brief Copy a block of pixels of one format to another format
 *
 *  \return 0 on success, or -1 if there was an error
 extern DECLSPEC int SDLCALL SDL_ConvertPixels(int width, int height,
											   Uint32 src_format,
											   const void * src, int src_pitch,
											   Uint32 dst_format,
											   void * dst, int dst_pitch);
 */
PHP_FUNCTION(SDL_ConvertPixels)
{
	zval *source, *destination;
	zend_long width, height, source_format, source_pitch, destination_format, destination_pitch;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lllOllOl", &width, &height, &source_format,
		&source, get_php_sdl_pixels_ce(), &source_pitch, &destination_format,
		&destination, get_php_sdl_pixels_ce(), &destination_pitch) == FAILURE) { RETURN_THROWS(); }
	SDL_Pixels *src = zval_to_sdl_pixels(source), *dst = zval_to_sdl_pixels(destination);
	if (!src || !dst) { if (!EG(exception)) { zend_throw_error(NULL, "pixel buffers must be live SDL_Pixels"); } RETURN_THROWS(); }
	if (width < 0 || height < 0 || width > INT_MAX || height > INT_MAX
		|| source_pitch <= 0 || source_pitch > INT_MAX || destination_pitch <= 0 || destination_pitch > INT_MAX) {
		zend_value_error("dimensions and positive pitches must fit int32"); RETURN_THROWS();
	}
	Uint32 formats[] = {(Uint32)source_format, (Uint32)destination_format};
	SDL_Pixels *buffers[] = {src, dst};
	zend_long pitches[] = {source_pitch, destination_pitch};
	size_t lengths[2];
	for (int i = 0; i < 2; i++) {
		SDL_PixelFormat *format = SDL_AllocFormat(formats[i]);
		if (!format || SDL_ISPIXELFORMAT_INDEXED(formats[i]) || SDL_ISPIXELFORMAT_FOURCC(formats[i])) {
			SDL_FreeFormat(format); zend_value_error("conversion requires packed, non-indexed pixel formats"); RETURN_THROWS();
		}
		unsigned int bytes = format->BytesPerPixel; SDL_FreeFormat(format);
		uint64_t row = (uint64_t)width * bytes;
		uint64_t required = width && height ? (uint64_t)(height - 1) * pitches[i] + row : 0;
		uint64_t available = (uint64_t)buffers[i]->pitch * buffers[i]->h;
		if (!bytes || row > pitches[i] || required > available || required > INT_MAX) {
			zend_value_error("pixel buffer is too short for width, height, format and pitch"); RETURN_THROWS();
		}
		lengths[i] = required;
	}
	if (!width || !height) { RETURN_LONG(0); }
	/* A format conversion may read bytes after writing earlier destination bytes. */
	uint64_t a = (uintptr_t)src->pixels, b = (uintptr_t)dst->pixels;
	const void *input = src->pixels;
	void *copy = NULL;
	if (a < b + lengths[1] && b < a + lengths[0]) { copy = emalloc(lengths[0]); memcpy(copy, input, lengths[0]); input = copy; }
	int result = SDL_ConvertPixels(width, height, source_format, input, source_pitch,
		destination_format, dst->pixels, destination_pitch);
	if (copy) { efree(copy); }
	RETURN_LONG(result);
}
/* }}} */

/* we need to undefine this macros to avoid substitution in list behind */
#undef SDL_BlitSurface
#undef SDL_BlitScaled

static const zend_function_entry php_sdl_surface_methods[] = {
	PHP_ME(SDL_Surface, __construct, arginfo_SDL_CreateRGBSurface, ZEND_ACC_CTOR | ZEND_ACC_PUBLIC)
		PHP_ME(SDL_Surface, __toString, arginfo_sdl_to_string, ZEND_ACC_PUBLIC)

	/* non-static methods */
	PHP_FALIAS(Free, SDL_FreeSurface, arginfo_surface_none)
		PHP_FALIAS(FillRect, SDL_FillRect, arginfo_SDL_Surface_FillRect)
			PHP_FALIAS(FillRects, SDL_FillRects, arginfo_SDL_Surface_FillRects)
				PHP_FALIAS(MustLock, SDL_MUSTLOCK, arginfo_surface_none)
					PHP_FALIAS(Lock, SDL_LockSurface, arginfo_surface_none)
						PHP_FALIAS(Unlock, SDL_UnlockSurface, arginfo_surface_none)
							PHP_FALIAS(Blit, SDL_UpperBlit, arginfo_SDL_Surface_UpperBlit)
								PHP_FALIAS(UpperBlit, SDL_UpperBlit, arginfo_SDL_Surface_UpperBlit)
									PHP_FALIAS(LowerBlit, SDL_LowerBlit, arginfo_SDL_Surface_LowerBlit)
										PHP_FALIAS(BlitScaled, SDL_UpperBlitScaled, arginfo_SDL_Surface_UpperBlit)
											PHP_FALIAS(UpperBlitScaled, SDL_UpperBlitScaled, arginfo_SDL_Surface_UpperBlit)
												PHP_FALIAS(LowerBlitScaled, SDL_LowerBlitScaled, arginfo_SDL_Surface_LowerBlit)
													PHP_FALIAS(SoftStretch, SDL_SoftStretch, arginfo_SDL_Surface_UpperBlit)
														PHP_FALIAS(SaveBMP_RW, SDL_SaveBMP_RW, arginfo_SDL_Surface_SaveBMP_RW)
															PHP_FALIAS(SaveBMP, SDL_SaveBMP, arginfo_SDL_Surface_SaveBMP)
																PHP_FALIAS(SetRLE, SDL_SetSurfaceRLE, arginfo_SDL_Surface_SetRLE)
																	PHP_FALIAS(SetColorKey, SDL_SetColorKey, arginfo_SDL_Surface_SetColorKey)
																		PHP_FALIAS(GetColorKey, SDL_GetColorKey, arginfo_SDL_Surface_GetColorKey)
																			PHP_FALIAS(SetColorMod, SDL_SetSurfaceColorMod, arginfo_SDL_Surface_SetColorMod)
																				PHP_FALIAS(GetColorMod, SDL_GetSurfaceColorMod, arginfo_SDL_Surface_GetColorMod)
																					PHP_FALIAS(SetAlphaMod, SDL_SetSurfaceAlphaMod, arginfo_SDL_Surface_SetAlphaMod)
																						PHP_FALIAS(GetAlphaMod, SDL_GetSurfaceAlphaMod, arginfo_SDL_Surface_GetAlphaMod)
																							PHP_FALIAS(SetBlendMode, SDL_SetSurfaceBlendMode, arginfo_SDL_Surface_SetBlendMode)
																								PHP_FALIAS(GetBlendMode, SDL_GetSurfaceBlendMode, arginfo_SDL_Surface_GetBlendMode)
																									PHP_FALIAS(SetClipRect, SDL_SetClipRect, arginfo_SDL_Surface_SetClipRect)
																										PHP_FALIAS(GetClipRect, SDL_GetClipRect, arginfo_SDL_Surface_GetClipRect)
																											PHP_FALIAS(Convert, SDL_ConvertSurface, arginfo_SDL_Surface_Convert)
																												PHP_FALIAS(ConvertFormat, SDL_ConvertSurfaceFormat, arginfo_SDL_Surface_ConvertFormat)

	/* static methods */
	ZEND_FENTRY(LoadRW, ZEND_FN(SDL_LoadBMP_RW), arginfo_SDL_LoadBMP_RW, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)
		ZEND_FENTRY(LoadBMP, ZEND_FN(SDL_LoadBMP), arginfo_SDL_LoadBMP, ZEND_ACC_PUBLIC | ZEND_ACC_STATIC)

			PHP_FE_END};

/* {{{ php_sdl_surface_free
 */
static void php_sdl_surface_free(zend_object *object)
{
	struct php_sdl_surface *intern = (struct php_sdl_surface *)((char *)object - object->handlers->offset);
	if (intern->surface)
	{
		if (!(intern->flags & SDL_DONTFREE))
		{
			SDL_FreeSurface(intern->surface);
		}
	}

	struct php_sdl_surface **link = &surfaces;
	while (*link != intern) { link = &(*link)->next; }
	*link = intern->next;
	zend_object_std_dtor(&intern->zo);
}
/* }}} */

/* {{{ php_sdl_surface_new
 */
static zend_object *php_sdl_surface_new(zend_class_entry *class_type)
{
	struct php_sdl_surface *intern;

	intern = (struct php_sdl_surface *)zend_object_alloc(sizeof(struct php_sdl_surface), class_type);

	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);

	intern->surface = NULL;
	intern->next = surfaces;
	surfaces = intern;
	intern->zo.handlers = (zend_object_handlers *)&php_sdl_surface_handlers;

	return &intern->zo;
}
/* }}} */

static inline struct php_sdl_surface *php_sdl_surface_from_obj(zend_object *obj)
{
	return (struct php_sdl_surface *)((char *)(obj)-obj->handlers->offset);
}

/* {{{ sdl_surface_read_property*/
zval *sdl_surface_read_property(zend_object *object, zend_string *member, int type, void **cache_slot, zval *retval)
{
	struct php_sdl_surface *intern;
	char *member_val;

	intern = php_sdl_surface_from_obj(object);
	member_val = ZSTR_VAL(member);

	if (!intern->surface)
	{
		if (!strcmp(member_val,"flags") || !strcmp(member_val,"w") || !strcmp(member_val,"h")
			|| !strcmp(member_val,"pitch") || !strcmp(member_val,"locked") || !strcmp(member_val,"format")
			|| !strcmp(member_val,"pixels") || !strcmp(member_val,"clip_rect")) {
			zend_throw_error(NULL, "SDL surface has been destroyed"); ZVAL_NULL(retval); return retval;
		}
		return zend_std_read_property(object, member, type, cache_slot, retval);
	}

	if (!strcmp(member_val, "flags"))
	{
		ZVAL_LONG(retval, intern->surface->flags);
	}
	else if (!strcmp(member_val, "w"))
	{
		ZVAL_LONG(retval, intern->surface->w);
	}
	else if (!strcmp(member_val, "h"))
	{
		ZVAL_LONG(retval, intern->surface->h);
	}
	else if (!strcmp(member_val, "pitch"))
	{
		ZVAL_LONG(retval, intern->surface->pitch);
	}
	else if (!strcmp(member_val, "locked"))
	{
		ZVAL_LONG(retval, intern->surface->locked);
	}
	else if (!strcmp(member_val, "format"))
	{
		sdl_pixelformat_to_zval(intern->surface->format, retval, SDL_DONTFREE);
		php_sdl_view_owner(retval, object);
	}
	else if (!strcmp(member_val, "clip_rect"))
	{
		sdl_rect_to_zval(&intern->surface->clip_rect, retval);
	}
	else if (!strcmp(member_val, "pixels"))
	{
		SDL_Pixels pix;
		pix.pitch = intern->surface->pitch;
		pix.h = intern->surface->h;
		pix.pixels = (Uint8 *)intern->surface->pixels;
		sdl_pixels_to_zval(&pix, retval, SDL_DONTFREE);
		php_sdl_view_owner(retval, object);
	}
	else
	{
		retval = zend_std_read_property(object, member, type, cache_slot, retval);
		return retval;
	}

	return retval;
}
/* }}} */

#define REGISTER_SURFACE_CLASS_CONST_LONG(const_name, value)                       \
	REGISTER_LONG_CONSTANT("SDL_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_surface_ce, ZEND_STRL(const_name), value)

#define REGISTER_SURFACE_PROP(name) \
	zend_declare_property_long(php_sdl_surface_ce, ZEND_STRL(name), 0, ZEND_ACC_PUBLIC)

/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_surface)
{
	zend_class_entry ce_surface;

	INIT_CLASS_ENTRY(ce_surface, "SDL_Surface", php_sdl_surface_methods);
	php_sdl_surface_ce = zend_register_internal_class(&ce_surface);
	php_sdl_surface_ce->create_object = php_sdl_surface_new;
	memcpy(&php_sdl_surface_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_surface_handlers.read_property = sdl_surface_read_property;
	php_sdl_surface_handlers.get_property_ptr_ptr = NULL;
	php_sdl_surface_handlers.free_obj = php_sdl_surface_free;
	php_sdl_surface_handlers.offset = XtOffsetOf(struct php_sdl_surface, zo);
	php_sdl_surface_handlers.clone_obj = NULL;
	if (php_sdl_deny_serialization(php_sdl_surface_ce) != SUCCESS) { return FAILURE; }

	REGISTER_SURFACE_PROP("flags");
	REGISTER_SURFACE_PROP("w");
	REGISTER_SURFACE_PROP("h");
	REGISTER_SURFACE_PROP("pitch");
	zend_declare_property_null(php_sdl_surface_ce, ZEND_STRL("format"), ZEND_ACC_PUBLIC);
	zend_declare_property_null(php_sdl_surface_ce, ZEND_STRL("clip_rect"), ZEND_ACC_PUBLIC);
	zend_declare_property_null(php_sdl_surface_ce, ZEND_STRL("pixels"), ZEND_ACC_PUBLIC);

	REGISTER_SURFACE_CLASS_CONST_LONG("SWSURFACE", SDL_SWSURFACE);
	REGISTER_SURFACE_CLASS_CONST_LONG("PREALLOC", SDL_PREALLOC);
	REGISTER_SURFACE_CLASS_CONST_LONG("RLEACCEL", SDL_RLEACCEL);
	REGISTER_SURFACE_CLASS_CONST_LONG("DONTFREE", SDL_DONTFREE);

	return SUCCESS;
}
/* }}} */
