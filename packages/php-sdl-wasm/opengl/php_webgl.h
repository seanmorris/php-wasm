/* Shared checked WebGL bindings. PHP License 3.01. */
#ifndef PHP_WEBGL_BINDINGS_H
#define PHP_WEBGL_BINDINGS_H
#ifdef HAVE_CONFIG_H
#include "config.h"
#endif
#include "php.h"
#include <SDL.h>
#include <GLES3/gl3.h>
#include <GLES2/gl2ext.h>
#include <limits.h>
#include <stdint.h>
#include <math.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/html5_webgl.h>
extern int php_webgl_context_version(void);
#endif

#define CONTEXT() do { \
	if (!SDL_GL_GetCurrentContext()) { \
		zend_throw_error(NULL, "OpenGL requires a current SDL GL context"); RETURN_THROWS(); \
	} \
} while (0)

static inline zend_bool php_webgl_is_3(void)
{
#ifdef __EMSCRIPTEN__
	/* Browser getContextAttributes() returns null while lost; the registered
	 * context's API version stays valid until that context is destroyed. */
	return php_webgl_context_version() >= 2;
#else
	return 1;
#endif
}
static inline zend_bool php_webgl_require_3(void)
{
	if (!php_webgl_is_3()) {
		zend_throw_error(NULL, "this function requires an SDL OpenGL ES 3 / WebGL2 context"); return 0;
	}
	return 1;
}
#define PARSE3(format, ...) do { PARSE(format, __VA_ARGS__); \
	if (!php_webgl_require_3()) { RETURN_THROWS(); } \
} while (0)
#define PARSE(format, ...) do { \
	if (zend_parse_parameters(ZEND_NUM_ARGS(), format, __VA_ARGS__) == FAILURE) { RETURN_THROWS(); } \
	CONTEXT(); \
} while (0)

zend_bool php_webgl_nonnegative(zend_long value, const char *name);
zend_bool php_webgl_uniform_float(double value);
zend_bool php_webgl_vertex_layout(zend_long index, zend_long size, zend_long type, zend_long stride, zend_long offset, zend_bool integer);
zend_bool php_webgl_index_range(zend_long count, zend_long type, zend_long offset);
void php_webgl_state_query(INTERNAL_FUNCTION_PARAMETERS, char kind);
void php_webgl_extra_constants(int module_number);

/* Numeric GL names are owned by the SDL context that allocated them. */
typedef enum {
	PHP_WEBGL_VERTEX_ARRAY, PHP_WEBGL_FRAMEBUFFER, PHP_WEBGL_PROGRAM,
	PHP_WEBGL_SHADER, PHP_WEBGL_RENDERBUFFER, PHP_WEBGL_TEXTURE, PHP_WEBGL_BUFFER, PHP_WEBGL_SAMPLER,
	PHP_WEBGL_OBJECT_TYPES
} php_webgl_object_type;
void php_webgl_objects_init(void);
void php_webgl_objects_shutdown(void);
void php_webgl_object_track(php_webgl_object_type type, GLuint object);
void php_webgl_object_forget(php_webgl_object_type type, GLuint object);
void php_webgl_delete_object(php_webgl_object_type type, GLuint object);
void php_webgl_generate(INTERNAL_FUNCTION_PARAMETERS, php_webgl_object_type type);
void php_webgl_delete(INTERNAL_FUNCTION_PARAMETERS, php_webgl_object_type type);
zend_bool php_webgl_shader(zend_long object);
zend_bool php_webgl_program(zend_long object);

#define nonnegative php_webgl_nonnegative
#define uniform_float php_webgl_uniform_float
#endif
