/* PHP License 3.01; see ../opengl/LICENSE in the source package. */
#ifndef PHP_SDL_MIXER_RW_H
#define PHP_SDL_MIXER_RW_H

#include <limits.h>

/* Shared close helper invalidates the wrapper before PHP callbacks run. */
extern int php_sdl_rwops_close(zval *source);
#define php_sdl_mixer_close_rw php_sdl_rwops_close

/* Streaming music must not retain a borrowed native pointer into a PHP object.
 * Its owned snapshot remains valid even if the caller closes or collects RWops. */
static SDL_RWops *php_sdl_mixer_snapshot_rw(SDL_RWops *source, void **buffer)
{
	Sint64 position = SDL_RWtell(source);
	if (EG(exception)) { return NULL; }
	Sint64 size = SDL_RWsize(source);
	if (EG(exception)) { return NULL; }
	if (position < 0 || size <= position || size - position > INT_MAX) {
		zend_value_error("music RWops must be a nonempty seekable stream of at most INT_MAX bytes");
		return NULL;
	}
	size_t remaining = (size_t)(size - position);
	void *bytes = emalloc(remaining);
	size_t read = SDL_RWread(source, bytes, 1, remaining);
	if (read != remaining || EG(exception)) {
		efree(bytes);
		if (!EG(exception)) { zend_throw_error(NULL, "Cannot read music RWops: %s", SDL_GetError()); }
		return NULL;
	}
	SDL_RWops *copy = SDL_RWFromConstMem(bytes, (int)remaining);
	if (!copy) { efree(bytes); zend_throw_error(NULL, "%s", SDL_GetError()); return NULL; }
	*buffer = bytes;
	return copy;
}
#endif
