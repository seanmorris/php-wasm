/* PHP SDL binding additions. Distributed under the PHP license. */
#ifndef PHP_SDL_EXTRA_H
#define PHP_SDL_EXTRA_H

#include "php_sdl.h"
#include <stdint.h>

PHP_MINIT_FUNCTION(sdl_extra);
PHP_RSHUTDOWN_FUNCTION(sdl_extra);
zend_result php_sdl_deny_serialization(zend_class_entry *ce);
zend_bool php_sdl_pixels_owned(zval *value);
void php_sdl_view_owner(zval *view, zend_object *owner);
zend_bool php_sdl_read_rect(zval *value, SDL_Rect *result);
zend_bool php_sdl_read_frect(zval *value, SDL_FRect *result);
zend_bool php_sdl_read_point(zval *value, SDL_Point *result);
zend_bool php_sdl_read_fpoint(zval *value, SDL_FPoint *result);
zend_bool php_sdl_read_color(zval *value, SDL_Color *result);
zend_bool php_sdl_write_rect(zval *value, const SDL_Rect *rect);
void php_sdl_uint64(zval *value, Uint64 number);
zend_bool php_sdl_decode_event(SDL_Event *event, zval *value);
SDL_Renderer *php_sdl_renderer(zval *value);
SDL_Texture *php_sdl_texture(zval *value);
zend_resource *php_sdl_register_renderer(SDL_Renderer *renderer, SDL_Window *window);
zend_resource *php_sdl_register_texture(SDL_Texture *texture, SDL_Renderer *renderer);
void php_sdl_renderer_free(zend_resource *resource);
void php_sdl_texture_free(zend_resource *resource);
void php_sdl_render_close(SDL_Window *window);
void php_sdl_joysticks_close(void);
void php_sdl_joysticks_forget(void);
void php_sdl_render_forget(void);
void php_sdl_windows_invalidate(SDL_Window *window);
int php_sdl_video_transitioning(void);
void php_sdl_text_window(SDL_Window *window);
void php_sdl_text_cleanup(SDL_Window *window);
void php_sdl_pointer_window(SDL_Window *window);
void php_sdl_pointer_cleanup(SDL_Window *window);
void php_sdl_cursors_invalidate(void);
zend_bool php_sdl_context_available(void);
zend_bool php_sdl_renderer_owns_context(SDL_GLContext context);
SDL_Window *php_sdl_renderer_context_window(SDL_GLContext context);
SDL_Window *php_sdl_context_window(SDL_GLContext context);
void php_sdl_context_invalidate(SDL_GLContext context);
void php_sdl_contexts_close(SDL_Window *window);
void php_sdl_context_cleanup_register(void (*cleanup)(SDL_GLContext));
void php_sdl_audio_cleanup_register(int (*cleanup)(void));
Uint64 php_sdl_context_generation(void);
PHP_MINIT_FUNCTION(sdl_controller);
PHP_MINIT_FUNCTION(sdl_geometry);

#endif
