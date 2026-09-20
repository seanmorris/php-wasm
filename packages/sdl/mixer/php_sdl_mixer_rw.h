/* PHP License 3.01; see ../opengl/LICENSE in the source package. */
#ifndef PHP_SDL_MIXER_RW_H
#define PHP_SDL_MIXER_RW_H

#include <limits.h>

/* Close through PHP so its SDL_RWops object and every alias are invalidated. */
static void php_sdl_mixer_close_rw(zval *source)
{
	zval name, result;
	ZVAL_STRING(&name, "SDL_RWclose");
	ZVAL_UNDEF(&result);
	call_user_function(EG(function_table), NULL, &name, &result, 1, source);
	zval_ptr_dtor(&name);
	zval_ptr_dtor(&result);
}

/* Streaming music must not retain a borrowed native pointer into a PHP object.
 * Its owned snapshot remains valid even if the caller closes or collects RWops. */
static SDL_RWops *php_sdl_mixer_snapshot_rw(SDL_RWops *source, void **buffer)
{
	Sint64 position = SDL_RWtell(source), size = SDL_RWsize(source);
	if (position < 0 || size <= position || size - position > INT_MAX) {
		zend_value_error("music RWops must be a nonempty seekable stream of at most INT_MAX bytes");
		return NULL;
	}
	size_t remaining = (size_t)(size - position);
	void *bytes = emalloc(remaining);
	if (SDL_RWread(source, bytes, 1, remaining) != remaining) {
		efree(bytes);
		zend_throw_error(NULL, "Cannot read music RWops: %s", SDL_GetError());
		return NULL;
	}
	SDL_RWops *copy = SDL_RWFromConstMem(bytes, (int)remaining);
	if (!copy) { efree(bytes); zend_throw_error(NULL, "%s", SDL_GetError()); return NULL; }
	*buffer = bytes;
	return copy;
}
#endif
