/*
 * Browser shader bindings for PECL opengl 0.9.0, PHP License 3.01.
 * Based on PHP-OpenGL by Santiago Lizardo and the PHP Group (1997–2016).
 * This translation unit replaces the desktop binding in php-wasm builds.
 * The PHP API is declared in php_webgl.stub.php; regenerate arginfo with
 * php third_party/php8.0-src/build/gen_stub.php packages/sdl/opengl/php_webgl.stub.php
 */
#ifdef HAVE_CONFIG_H
#include "config.h"
#endif
#include "php.h"
#include "ext/standard/info.h"
#include <SDL.h>
#include <GLES3/gl3.h>
#include <limits.h>
#include <stdint.h>
#include <math.h>
#include "php_webgl_arginfo.h"

extern SDL_Surface *zval_to_sdl_surface(zval *value);

#define CONTEXT() do { \
	if (!SDL_GL_GetCurrentContext()) { \
		zend_throw_error(NULL, "OpenGL requires a current SDL GL context"); RETURN_THROWS(); \
	} \
} while (0)
#define PARSE(format, ...) do { \
	if (zend_parse_parameters(ZEND_NUM_ARGS(), format, __VA_ARGS__) == FAILURE) { RETURN_THROWS(); } \
	CONTEXT(); \
} while (0)
#define VOID0(name) PHP_FUNCTION(name) { ZEND_PARSE_PARAMETERS_NONE(); CONTEXT(); name(); }
#define UINT1(name) PHP_FUNCTION(name) { zend_long a; PARSE("l", &a); name((GLuint)a); }
#define UINT2(name) PHP_FUNCTION(name) { zend_long a, b; PARSE("ll", &a, &b); name((GLuint)a, (GLuint)b); }

static zend_bool nonnegative(zend_long value, const char *name)
{
	if (value < 0 || value > INT_MAX) {
		zend_value_error("%s must be between 0 and INT_MAX", name);
		return 0;
	}
	return 1;
}

VOID0(glFlush)
VOID0(glFinish)
UINT1(glClear)
UINT1(glClearStencil)
UINT1(glEnable)
UINT1(glDisable)
UINT1(glDepthFunc)
UINT1(glCullFace)
UINT1(glFrontFace)
UINT1(glCompileShader)
UINT1(glDeleteShader)
UINT1(glLinkProgram)
UINT1(glUseProgram)
UINT1(glDeleteProgram)
UINT1(glBindVertexArray)
UINT1(glEnableVertexAttribArray)
UINT1(glDisableVertexAttribArray)
UINT1(glActiveTexture)
UINT1(glGenerateMipmap)
UINT2(glBlendFunc)
UINT2(glAttachShader)
UINT2(glDetachShader)
UINT2(glBindBuffer)
UINT2(glBindTexture)
UINT2(glBindFramebuffer)

PHP_FUNCTION(glGetError) { ZEND_PARSE_PARAMETERS_NONE(); CONTEXT(); RETURN_LONG(glGetError()); }
PHP_FUNCTION(glGetString)
{
	zend_long name; PARSE("l", &name);
	const GLubyte *value = glGetString((GLenum)name);
	if (!value) { RETURN_NULL(); }
	RETURN_STRING((const char *)value);
}
PHP_FUNCTION(glIsEnabled) { zend_long a; PARSE("l", &a); RETURN_BOOL(glIsEnabled((GLenum)a)); }
PHP_FUNCTION(glGetIntegerv)
{
	zend_long name; PARSE("l", &name);
	/* glGetIntegerv can write arrays. Only scalar selectors fit this PHP result. */
	switch (name) {
		case GL_CURRENT_PROGRAM: case GL_ARRAY_BUFFER_BINDING: case GL_ELEMENT_ARRAY_BUFFER_BINDING:
		case GL_VERTEX_ARRAY_BINDING: case GL_TEXTURE_BINDING_2D: case GL_ACTIVE_TEXTURE:
		case GL_FRAMEBUFFER_BINDING: case GL_MAX_TEXTURE_SIZE: case GL_MAX_VERTEX_ATTRIBS:
		case GL_MAX_TEXTURE_IMAGE_UNITS: case GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS:
		case GL_PACK_ALIGNMENT: case GL_UNPACK_ALIGNMENT: case GL_DEPTH_FUNC:
		case GL_CULL_FACE_MODE: case GL_FRONT_FACE: case GL_MAX_RENDERBUFFER_SIZE: break;
		default: zend_value_error("glGetIntegerv supports scalar binding, limit and alignment selectors"); RETURN_THROWS();
	}
	GLint value = 0; glGetIntegerv((GLenum)name, &value); RETURN_LONG(value);
}
PHP_FUNCTION(glClearColor)
{
	double r, g, b, a; PARSE("dddd", &r, &g, &b, &a);
	glClearColor((GLfloat)r, (GLfloat)g, (GLfloat)b, (GLfloat)a);
}
PHP_FUNCTION(glClearDepth) { double a; PARSE("d", &a); glClearDepthf((GLfloat)a); }
PHP_FUNCTION(glDepthMask) { zend_bool a; PARSE("b", &a); glDepthMask(a); }
#define RECTANGLE(name) PHP_FUNCTION(name) { \
	zend_long x, y, w, h; PARSE("llll", &x, &y, &w, &h); \
	if (!nonnegative(w, "width") || !nonnegative(h, "height")) { RETURN_THROWS(); } \
	name((GLint)x, (GLint)y, (GLsizei)w, (GLsizei)h); \
}
RECTANGLE(glViewport)
RECTANGLE(glScissor)
PHP_FUNCTION(glPixelStorei)
{
	zend_long name, value; PARSE("ll", &name, &value);
	if ((name != GL_PACK_ALIGNMENT && name != GL_UNPACK_ALIGNMENT)
		|| (value != 1 && value != 2 && value != 4 && value != 8)) {
		zend_value_error("glPixelStorei supports PACK/UNPACK_ALIGNMENT of 1, 2, 4 or 8"); RETURN_THROWS();
	}
	glPixelStorei((GLenum)name, (GLint)value);
}
PHP_FUNCTION(glCreateShader) { zend_long type; PARSE("l", &type); RETURN_LONG(glCreateShader((GLenum)type)); }
PHP_FUNCTION(glCreateProgram) { ZEND_PARSE_PARAMETERS_NONE(); CONTEXT(); RETURN_LONG(glCreateProgram()); }
PHP_FUNCTION(glShaderSource)
{
	zend_long shader, count, length = 0;
	zend_string *source;
	PARSE("llS|l", &shader, &count, &source, &length);
	if (count != 1 || length < 0 || (size_t)length > ZSTR_LEN(source) || ZSTR_LEN(source) > INT_MAX) {
		zend_value_error("glShaderSource requires count=1 and a length within the source string"); RETURN_THROWS();
	}
	const GLchar *text = ZSTR_VAL(source);
	GLint size = length ? (GLint)length : (GLint)ZSTR_LEN(source);
	glShaderSource((GLuint)shader, 1, &text, &size);
}
#define QUERY_OBJECT(name, native) PHP_FUNCTION(name) { \
	zend_long object, parameter; PARSE("ll", &object, &parameter); \
	GLint result = 0; native((GLuint)object, (GLenum)parameter, &result); RETURN_LONG(result); \
}
QUERY_OBJECT(glGetShaderiv, glGetShaderiv)
QUERY_OBJECT(glGetProgramiv, glGetProgramiv)
static void object_log(GLuint object, zend_bool shader, zval *result)
{
	GLint length = 0;
	if (shader) { glGetShaderiv(object, GL_INFO_LOG_LENGTH, &length); }
	else { glGetProgramiv(object, GL_INFO_LOG_LENGTH, &length); }
	if (length <= 1) { ZVAL_EMPTY_STRING(result); return; }
	zend_string *text = zend_string_alloc((size_t)length, 0);
	GLsizei written = 0;
	if (shader) { glGetShaderInfoLog(object, length, &written, ZSTR_VAL(text)); }
	else { glGetProgramInfoLog(object, length, &written, ZSTR_VAL(text)); }
	if (written < 0) { written = 0; }
	if (written > length) { written = length; }
	while (written && ZSTR_VAL(text)[written - 1] == '\0') { written--; }
	ZSTR_LEN(text) = written;
	ZSTR_VAL(text)[written] = 0;
	ZVAL_STR(result, text);
}
PHP_FUNCTION(glGetShaderInfoLog) { zend_long id; PARSE("l", &id); object_log((GLuint)id, 1, return_value); }
PHP_FUNCTION(glGetProgramInfoLog) { zend_long id; PARSE("l", &id); object_log((GLuint)id, 0, return_value); }
#define LOCATION(name) PHP_FUNCTION(name) { \
	zend_long program; zend_string *symbol; PARSE("lS", &program, &symbol); \
	RETURN_LONG(name((GLuint)program, ZSTR_VAL(symbol))); \
}
LOCATION(glGetAttribLocation)
LOCATION(glGetUniformLocation)
PHP_FUNCTION(glUniform1i) { zend_long a, b; PARSE("ll", &a, &b); glUniform1i((GLint)a, (GLint)b); }
PHP_FUNCTION(glUniform1f) { zend_long a; double b; PARSE("ld", &a, &b); glUniform1f((GLint)a, (GLfloat)b); }
PHP_FUNCTION(glUniform3f)
{
	zend_long a; double x, y, z; PARSE("lddd", &a, &x, &y, &z);
	glUniform3f((GLint)a, (GLfloat)x, (GLfloat)y, (GLfloat)z);
}
PHP_FUNCTION(glUniform4f)
{
	zend_long a; double x, y, z, w; PARSE("ldddd", &a, &x, &y, &z, &w);
	glUniform4f((GLint)a, (GLfloat)x, (GLfloat)y, (GLfloat)z, (GLfloat)w);
}
PHP_FUNCTION(glUniformMatrix4fv)
{
	zend_long location, count; zend_bool transpose; zval *values, *entry;
	PARSE("llba", &location, &count, &transpose, &values);
	if (transpose || !nonnegative(count, "count") || (uint64_t)count * 16 != zend_hash_num_elements(Z_ARRVAL_P(values))) {
		zend_value_error("matrix data must contain exactly count*16 numbers; transpose must be false"); RETURN_THROWS();
	}
	GLfloat *data = safe_emalloc((size_t)count, 16 * sizeof(GLfloat), 0);
	size_t i = 0;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) {
		ZVAL_DEREF(entry);
		if ((Z_TYPE_P(entry) != IS_LONG && Z_TYPE_P(entry) != IS_DOUBLE) || !isfinite(zval_get_double(entry))) {
			efree(data); zend_value_error("matrix elements must be finite numbers"); RETURN_THROWS();
		}
		data[i++] = (GLfloat)zval_get_double(entry);
	} ZEND_HASH_FOREACH_END();
	glUniformMatrix4fv((GLint)location, (GLsizei)count, GL_FALSE, data);
	efree(data);
}

/* Numeric GL object handles stay owned by their SDL context. PHP uploads never
 * accept raw heap pointers: buffer-relative offsets and checked bytes only. */
#define GENERATE(name) PHP_FUNCTION(name) { \
	zend_long count; zval *output; PARSE("lz", &count, &output); \
	if (!nonnegative(count, "count")) { RETURN_THROWS(); } \
	GLuint *ids = ecalloc((size_t)count, sizeof(GLuint)); \
	name((GLsizei)count, ids); ZVAL_DEREF(output); zval_ptr_dtor(output); array_init(output); \
	for (zend_long i = 0; i < count; i++) { add_next_index_long(output, ids[i]); } \
	efree(ids); RETURN_TRUE; \
}
#define DELETE(name) PHP_FUNCTION(name) { \
	zend_long count; zval *values, *entry; PARSE("la", &count, &values); \
	if (!nonnegative(count, "count") || (zend_ulong)count != zend_hash_num_elements(Z_ARRVAL_P(values))) { \
		zend_value_error("count must match the number of handles"); RETURN_THROWS(); \
	} \
	GLuint *ids = safe_emalloc((size_t)count, sizeof(GLuint), 0); size_t i = 0; \
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) { \
		ZVAL_DEREF(entry); \
		if (Z_TYPE_P(entry) != IS_LONG || Z_LVAL_P(entry) < 0 || (uint64_t)Z_LVAL_P(entry) > UINT_MAX) { \
			efree(ids); zend_value_error("handles must be unsigned integers"); RETURN_THROWS(); \
		} \
		ids[i++] = (GLuint)Z_LVAL_P(entry); \
	} ZEND_HASH_FOREACH_END(); \
	name((GLsizei)count, ids); efree(ids); \
}
GENERATE(glGenBuffers)
GENERATE(glGenTextures)
GENERATE(glGenVertexArrays)
GENERATE(glGenFramebuffers)
DELETE(glDeleteBuffers)
DELETE(glDeleteTextures)
DELETE(glDeleteVertexArrays)
DELETE(glDeleteFramebuffers)
PHP_FUNCTION(glBufferData)
{
	zend_long target, size, usage; zend_string *data = NULL;
	PARSE("llS!l", &target, &size, &data, &usage);
	if (!nonnegative(size, "size") || (data && (size_t)size > ZSTR_LEN(data))) {
		zend_value_error("size exceeds the supplied buffer"); RETURN_THROWS();
	}
	glBufferData((GLenum)target, (GLsizeiptr)size, data ? ZSTR_VAL(data) : NULL, (GLenum)usage);
}
PHP_FUNCTION(glBufferSubData)
{
	zend_long target, offset, size; zend_string *data;
	PARSE("lllS", &target, &offset, &size, &data);
	if (!nonnegative(offset, "offset") || !nonnegative(size, "size") || (size_t)size > ZSTR_LEN(data)) {
		zend_value_error("invalid offset or size exceeds the supplied buffer"); RETURN_THROWS();
	}
	glBufferSubData((GLenum)target, (GLintptr)offset, (GLsizeiptr)size, ZSTR_VAL(data));
}
PHP_FUNCTION(glVertexAttribPointer)
{
	zend_long index, size, type, stride, offset; zend_bool normalized;
	PARSE("lllbll", &index, &size, &type, &normalized, &stride, &offset);
	GLint buffer = 0; glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &buffer);
	if (!buffer || !nonnegative(offset, "offset") || !nonnegative(stride, "stride")) {
		zend_value_error("glVertexAttribPointer requires a bound vertex buffer and nonnegative offsets"); RETURN_THROWS();
	}
	glVertexAttribPointer((GLuint)index, (GLint)size, (GLenum)type, normalized, (GLsizei)stride, (void *)(uintptr_t)offset);
}
PHP_FUNCTION(glDrawArrays)
{
	zend_long mode, first, count; PARSE("lll", &mode, &first, &count);
	if (!nonnegative(first, "first") || !nonnegative(count, "count")) { RETURN_THROWS(); }
	glDrawArrays((GLenum)mode, (GLint)first, (GLsizei)count);
}
PHP_FUNCTION(glDrawElements)
{
	zend_long mode, count, type, offset; PARSE("llll", &mode, &count, &type, &offset);
	GLint buffer = 0, bytes = 0;
	glGetIntegerv(GL_ELEMENT_ARRAY_BUFFER_BINDING, &buffer);
	int element = type == GL_UNSIGNED_BYTE ? 1 : type == GL_UNSIGNED_SHORT ? 2 : type == GL_UNSIGNED_INT ? 4 : 0;
	if (!buffer || !element || !nonnegative(offset, "offset") || !nonnegative(count, "count")) {
		zend_value_error("indexed drawing requires a bound index buffer, unsigned index type and valid offset/count"); RETURN_THROWS();
	}
	glGetBufferParameteriv(GL_ELEMENT_ARRAY_BUFFER, GL_BUFFER_SIZE, &bytes);
	if (offset % element || (uint64_t)offset + (uint64_t)count * element > (uint64_t)bytes) {
		zend_value_error("indices exceed the bound index buffer or have an unaligned offset"); RETURN_THROWS();
	}
	glDrawElements((GLenum)mode, (GLsizei)count, (GLenum)type, (void *)(uintptr_t)offset);
}
PHP_FUNCTION(glTexParameteri) { zend_long a,b,c; PARSE("lll", &a,&b,&c); glTexParameteri((GLenum)a,(GLenum)b,(GLint)c); }

static zend_bool pixel_size(zend_long width, zend_long height, GLenum format, GLenum type, zend_bool pack, size_t *bytes)
{
	if (!nonnegative(width, "width") || !nonnegative(height, "height")) { return 0; }
	GLint alignment = 4, row = 0, rows = 0, pixels = 0, buffer = 0;
	glGetIntegerv(pack ? GL_PACK_ALIGNMENT : GL_UNPACK_ALIGNMENT, &alignment);
	glGetIntegerv(pack ? GL_PACK_ROW_LENGTH : GL_UNPACK_ROW_LENGTH, &row);
	glGetIntegerv(pack ? GL_PACK_SKIP_ROWS : GL_UNPACK_SKIP_ROWS, &rows);
	glGetIntegerv(pack ? GL_PACK_SKIP_PIXELS : GL_UNPACK_SKIP_PIXELS, &pixels);
	glGetIntegerv(pack ? GL_PIXEL_PACK_BUFFER_BINDING : GL_PIXEL_UNPACK_BUFFER_BINDING, &buffer);
	if (row || rows || pixels || buffer) {
		zend_value_error("pixel transfers require zero row/skip settings and no pixel buffer binding"); return 0;
	}
	int components = format == GL_RGBA ? 4 : format == GL_RGB ? 3 : format == GL_RG ? 2 : format == GL_RED || format == GL_DEPTH_COMPONENT ? 1 : 0;
	int element = type == GL_UNSIGNED_BYTE ? 1 : type == GL_UNSIGNED_SHORT || type == GL_HALF_FLOAT ? 2 : type == GL_UNSIGNED_INT || type == GL_FLOAT ? 4 : 0;
	if (!components || !element) { zend_value_error("unsupported pixel format/type; use RED, RG, RGB or RGBA packed components"); return 0; }
	uint64_t line = (uint64_t)width * components * element;
	if (line > INT_MAX) { zend_value_error("pixel row is too large"); return 0; }
	uint64_t stride = (line + alignment - 1) & ~(uint64_t)(alignment - 1);
	uint64_t required = height ? stride * (height - 1) + line : 0;
	if (required > INT_MAX) { zend_value_error("pixel transfer is too large"); return 0; }
	*bytes = (size_t)required;
	return 1;
}

static void texture_upload(INTERNAL_FUNCTION_PARAMETERS, zend_bool subimage)
{
	zend_long target, level, x = 0, y = 0, internal = 0, width, height, border = 0, format, type;
	zval *value;
	if (subimage) {
		PARSE("llllllllz", &target, &level, &x, &y, &width, &height, &format, &type, &value);
	} else {
		PARSE("llllllllz", &target, &level, &internal, &width, &height, &border, &format, &type, &value);
	}
	if (border || !nonnegative(level, "level") || !nonnegative(x, "x") || !nonnegative(y, "y")) {
		zend_value_error("texture border must be zero and offsets/level nonnegative"); RETURN_THROWS();
	}
	SDL_Surface *converted = NULL;
	const void *data = NULL;
	size_t bytes;
	GLint old_alignment = 4;
	if (Z_TYPE_P(value) == IS_OBJECT) {
		SDL_Surface *surface = zval_to_sdl_surface(value);
		if (!surface || surface->w != width || surface->h != height || format != GL_RGBA || type != GL_UNSIGNED_BYTE) {
			zend_value_error("surface upload requires a live SDL_Surface, matching dimensions, RGBA and UNSIGNED_BYTE"); RETURN_THROWS();
		}
		converted = SDL_ConvertSurfaceFormat(surface, SDL_PIXELFORMAT_RGBA32, 0);
		if (!converted) { zend_throw_error(NULL, "%s", SDL_GetError()); RETURN_THROWS(); }
		data = converted->pixels;
		glGetIntegerv(GL_UNPACK_ALIGNMENT, &old_alignment);
		glPixelStorei(GL_UNPACK_ALIGNMENT, 4);
	} else if (Z_TYPE_P(value) == IS_STRING) {
		data = Z_STRVAL_P(value);
	} else if (Z_TYPE_P(value) != IS_NULL || subimage) {
		zend_type_error("pixels must be packed bytes, SDL_Surface, or null for allocation"); RETURN_THROWS();
	}
	if (!pixel_size(width, height, (GLenum)format, (GLenum)type, 0, &bytes)
		|| (Z_TYPE_P(value) == IS_STRING && bytes > Z_STRLEN_P(value))) {
		if (converted) { glPixelStorei(GL_UNPACK_ALIGNMENT, old_alignment); SDL_FreeSurface(converted); }
		if (!EG(exception)) { zend_value_error("pixel data is shorter than the requested texture"); }
		RETURN_THROWS();
	}
	if (subimage) { glTexSubImage2D((GLenum)target, (GLint)level, (GLint)x, (GLint)y, (GLsizei)width, (GLsizei)height, (GLenum)format, (GLenum)type, data); }
	else { glTexImage2D((GLenum)target, (GLint)level, (GLint)internal, (GLsizei)width, (GLsizei)height, 0, (GLenum)format, (GLenum)type, data); }
	if (converted) { glPixelStorei(GL_UNPACK_ALIGNMENT, old_alignment); SDL_FreeSurface(converted); }
}
PHP_FUNCTION(glTexImage2D) { texture_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0); }
PHP_FUNCTION(glTexSubImage2D) { texture_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1); }
PHP_FUNCTION(glReadPixels)
{
	zend_long x, y, width, height, format, type;
	PARSE("llllll", &x, &y, &width, &height, &format, &type);
	size_t bytes;
	if (!pixel_size(width, height, (GLenum)format, (GLenum)type, 1, &bytes)) { RETURN_THROWS(); }
	zend_string *result = zend_string_alloc(bytes, 0);
	memset(ZSTR_VAL(result), 0, bytes + 1);
	glReadPixels((GLint)x, (GLint)y, (GLsizei)width, (GLsizei)height, (GLenum)format, (GLenum)type, ZSTR_VAL(result));
	RETURN_STR(result);
}
PHP_FUNCTION(glFramebufferTexture2D)
{
	zend_long a,b,c,d,e; PARSE("lllll", &a,&b,&c,&d,&e);
	glFramebufferTexture2D((GLenum)a,(GLenum)b,(GLenum)c,(GLuint)d,(GLint)e);
}
PHP_FUNCTION(glCheckFramebufferStatus) { zend_long a; PARSE("l", &a); RETURN_LONG(glCheckFramebufferStatus((GLenum)a)); }

PHP_MINIT_FUNCTION(opengl)
{
#define GL_CONSTANT(name) REGISTER_LONG_CONSTANT(#name, name, CONST_CS | CONST_PERSISTENT)
	GL_CONSTANT(GL_FALSE); GL_CONSTANT(GL_TRUE); GL_CONSTANT(GL_NO_ERROR);
	GL_CONSTANT(GL_INVALID_ENUM); GL_CONSTANT(GL_INVALID_VALUE); GL_CONSTANT(GL_INVALID_OPERATION);
	GL_CONSTANT(GL_VENDOR); GL_CONSTANT(GL_RENDERER); GL_CONSTANT(GL_VERSION); GL_CONSTANT(GL_SHADING_LANGUAGE_VERSION);
	GL_CONSTANT(GL_COLOR_BUFFER_BIT); GL_CONSTANT(GL_DEPTH_BUFFER_BIT); GL_CONSTANT(GL_STENCIL_BUFFER_BIT);
	GL_CONSTANT(GL_DEPTH_TEST); GL_CONSTANT(GL_BLEND); GL_CONSTANT(GL_CULL_FACE); GL_CONSTANT(GL_SCISSOR_TEST);
	GL_CONSTANT(GL_LESS); GL_CONSTANT(GL_LEQUAL); GL_CONSTANT(GL_ALWAYS); GL_CONSTANT(GL_BACK); GL_CONSTANT(GL_FRONT);
	GL_CONSTANT(GL_CW); GL_CONSTANT(GL_CCW); GL_CONSTANT(GL_ZERO); GL_CONSTANT(GL_ONE);
	GL_CONSTANT(GL_SRC_ALPHA); GL_CONSTANT(GL_ONE_MINUS_SRC_ALPHA);
	GL_CONSTANT(GL_VERTEX_SHADER); GL_CONSTANT(GL_FRAGMENT_SHADER); GL_CONSTANT(GL_COMPILE_STATUS);
	GL_CONSTANT(GL_LINK_STATUS); GL_CONSTANT(GL_INFO_LOG_LENGTH); GL_CONSTANT(GL_DELETE_STATUS);
	GL_CONSTANT(GL_ACTIVE_UNIFORMS); GL_CONSTANT(GL_ACTIVE_ATTRIBUTES); GL_CONSTANT(GL_CURRENT_PROGRAM);
	GL_CONSTANT(GL_ARRAY_BUFFER); GL_CONSTANT(GL_ELEMENT_ARRAY_BUFFER); GL_CONSTANT(GL_ARRAY_BUFFER_BINDING);
	GL_CONSTANT(GL_ELEMENT_ARRAY_BUFFER_BINDING); GL_CONSTANT(GL_VERTEX_ARRAY_BINDING);
	GL_CONSTANT(GL_STATIC_DRAW); GL_CONSTANT(GL_DYNAMIC_DRAW); GL_CONSTANT(GL_STREAM_DRAW);
	GL_CONSTANT(GL_BYTE); GL_CONSTANT(GL_UNSIGNED_BYTE); GL_CONSTANT(GL_SHORT); GL_CONSTANT(GL_UNSIGNED_SHORT);
	GL_CONSTANT(GL_INT); GL_CONSTANT(GL_UNSIGNED_INT); GL_CONSTANT(GL_FLOAT); GL_CONSTANT(GL_HALF_FLOAT);
	GL_CONSTANT(GL_TRIANGLES); GL_CONSTANT(GL_TRIANGLE_STRIP); GL_CONSTANT(GL_LINES); GL_CONSTANT(GL_POINTS);
	GL_CONSTANT(GL_TEXTURE_2D); GL_CONSTANT(GL_TEXTURE0); GL_CONSTANT(GL_TEXTURE1); GL_CONSTANT(GL_ACTIVE_TEXTURE);
	GL_CONSTANT(GL_TEXTURE_BINDING_2D); GL_CONSTANT(GL_TEXTURE_MIN_FILTER); GL_CONSTANT(GL_TEXTURE_MAG_FILTER);
	GL_CONSTANT(GL_TEXTURE_WRAP_S); GL_CONSTANT(GL_TEXTURE_WRAP_T); GL_CONSTANT(GL_NEAREST); GL_CONSTANT(GL_LINEAR);
	GL_CONSTANT(GL_LINEAR_MIPMAP_LINEAR); GL_CONSTANT(GL_CLAMP_TO_EDGE); GL_CONSTANT(GL_REPEAT);
	GL_CONSTANT(GL_RED); GL_CONSTANT(GL_RG); GL_CONSTANT(GL_RGB); GL_CONSTANT(GL_RGBA); GL_CONSTANT(GL_RGBA8);
	GL_CONSTANT(GL_DEPTH_COMPONENT); GL_CONSTANT(GL_PACK_ALIGNMENT); GL_CONSTANT(GL_UNPACK_ALIGNMENT);
	GL_CONSTANT(GL_MAX_TEXTURE_SIZE); GL_CONSTANT(GL_MAX_VERTEX_ATTRIBS); GL_CONSTANT(GL_MAX_TEXTURE_IMAGE_UNITS);
	GL_CONSTANT(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS); GL_CONSTANT(GL_DEPTH_FUNC); GL_CONSTANT(GL_CULL_FACE_MODE);
	GL_CONSTANT(GL_FRONT_FACE); GL_CONSTANT(GL_MAX_RENDERBUFFER_SIZE);
	GL_CONSTANT(GL_FRAMEBUFFER); GL_CONSTANT(GL_FRAMEBUFFER_BINDING); GL_CONSTANT(GL_COLOR_ATTACHMENT0);
	GL_CONSTANT(GL_FRAMEBUFFER_COMPLETE); GL_CONSTANT(GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT);
#undef GL_CONSTANT
	return SUCCESS;
}
PHP_MINFO_FUNCTION(opengl)
{
	php_info_print_table_start();
	php_info_print_table_row(2, "OpenGL support", "SDL WebGL shader bindings");
	php_info_print_table_row(2, "OpenGL PHP extension version", "0.9.0");
	php_info_print_table_end();
}
static const zend_module_dep dependencies[] = { ZEND_MOD_REQUIRED("sdl") ZEND_MOD_END };
zend_module_entry opengl_module_entry = {
	STANDARD_MODULE_HEADER_EX, NULL, dependencies, "opengl", ext_functions,
	PHP_MINIT(opengl), NULL, NULL, NULL, PHP_MINFO(opengl), "0.9.0", STANDARD_MODULE_PROPERTIES
};
#ifdef COMPILE_DL_OPENGL
ZEND_GET_MODULE(opengl)
#endif
