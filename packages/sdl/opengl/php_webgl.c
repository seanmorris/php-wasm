/*
 * Browser shader bindings for PECL opengl 0.9.0, PHP License 3.01.
 * Based on PHP-OpenGL by Santiago Lizardo and the PHP Group (1997–2016).
 * This translation unit replaces the desktop binding in php-wasm builds.
 * The PHP API is declared in php_webgl.stub.php; regenerate arginfo with
 * php third_party/php8.0-src/build/gen_stub.php packages/sdl/opengl/php_webgl.stub.php
 */
#include "php_webgl.h"
#include "ext/standard/info.h"
#include "php_webgl_arginfo.h"

#define VOID0(name) PHP_FUNCTION(name) { ZEND_PARSE_PARAMETERS_NONE(); CONTEXT(); name(); }
#define UINT1(name) PHP_FUNCTION(name) { zend_long a; PARSE("l", &a); name((GLuint)a); }
#define UINT2(name) PHP_FUNCTION(name) { zend_long a, b; PARSE("ll", &a, &b); name((GLuint)a, (GLuint)b); }

zend_bool nonnegative(zend_long value, const char *name)
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
UINT1(glBindVertexArray)
UINT1(glEnableVertexAttribArray)
UINT1(glDisableVertexAttribArray)
UINT1(glActiveTexture)
UINT1(glGenerateMipmap)
UINT2(glBlendFunc)
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
	php_webgl_state_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 'i');
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
PHP_FUNCTION(glCreateShader)
{
	zend_long type; PARSE("l", &type);
	GLuint shader = glCreateShader((GLenum)type);
	php_webgl_object_track(PHP_WEBGL_SHADER, shader); RETURN_LONG(shader);
}
PHP_FUNCTION(glCreateProgram)
{
	ZEND_PARSE_PARAMETERS_NONE(); CONTEXT();
	GLuint program = glCreateProgram();
	php_webgl_object_track(PHP_WEBGL_PROGRAM, program); RETURN_LONG(program);
}
PHP_FUNCTION(glCompileShader)
{
	zend_long shader; PARSE("l", &shader);
	if (!php_webgl_shader(shader)) { RETURN_THROWS(); }
	glCompileShader(shader);
}
PHP_FUNCTION(glLinkProgram)
{
	zend_long program; PARSE("l", &program);
	if (!php_webgl_program(program)) { RETURN_THROWS(); }
	glLinkProgram(program);
}
PHP_FUNCTION(glUseProgram)
{
	zend_long program; PARSE("l", &program);
	if (program && !php_webgl_program(program)) { RETURN_THROWS(); }
	glUseProgram(program);
}
#define DELETE_OBJECT(name, kind) PHP_FUNCTION(name) { \
	zend_long object; PARSE("l", &object); \
	if (!nonnegative(object, "handle")) { RETURN_THROWS(); } \
	php_webgl_delete_object(kind, object); \
}
DELETE_OBJECT(glDeleteShader, PHP_WEBGL_SHADER)
DELETE_OBJECT(glDeleteProgram, PHP_WEBGL_PROGRAM)
#define SHADER_ATTACHMENT(name) PHP_FUNCTION(name) { \
	zend_long program, shader; PARSE("ll", &program, &shader); \
	if (!php_webgl_program(program) || !php_webgl_shader(shader)) { RETURN_THROWS(); } \
	name(program, shader); \
}
SHADER_ATTACHMENT(glAttachShader)
SHADER_ATTACHMENT(glDetachShader)
PHP_FUNCTION(glShaderSource)
{
	zend_long shader, count, length = 0;
	zend_string *source;
	PARSE("llS|l", &shader, &count, &source, &length);
	if (!php_webgl_shader(shader)) { RETURN_THROWS(); }
	if (count != 1 || length < 0 || (size_t)length > ZSTR_LEN(source) || ZSTR_LEN(source) > INT_MAX) {
		zend_value_error("glShaderSource requires count=1 and a length within the source string"); RETURN_THROWS();
	}
	const GLchar *text = ZSTR_VAL(source);
	GLint size = length ? (GLint)length : (GLint)ZSTR_LEN(source);
	glShaderSource((GLuint)shader, 1, &text, &size);
}
#define QUERY_OBJECT(name, valid) PHP_FUNCTION(name) { \
	zend_long object, parameter; PARSE("ll", &object, &parameter); \
	if (!valid(object)) { RETURN_THROWS(); } \
	GLint result = 0; name((GLuint)object, (GLenum)parameter, &result); RETURN_LONG(result); \
}
QUERY_OBJECT(glGetShaderiv, php_webgl_shader)
QUERY_OBJECT(glGetProgramiv, php_webgl_program)
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
PHP_FUNCTION(glGetShaderInfoLog) {
	zend_long id; PARSE("l", &id); if (!php_webgl_shader(id)) { RETURN_THROWS(); }
	object_log((GLuint)id, 1, return_value);
}
PHP_FUNCTION(glGetProgramInfoLog) {
	zend_long id; PARSE("l", &id); if (!php_webgl_program(id)) { RETURN_THROWS(); }
	object_log((GLuint)id, 0, return_value);
}
#define LOCATION(name) PHP_FUNCTION(name) { \
	zend_long program; zend_string *symbol; PARSE("lS", &program, &symbol); \
	if (!php_webgl_program(program)) { RETURN_THROWS(); } \
	RETURN_LONG(name((GLuint)program, ZSTR_VAL(symbol))); \
}
LOCATION(glGetAttribLocation)
LOCATION(glGetUniformLocation)
/* Uniform inputs must fit their native representation before any GL call. */
zend_bool uniform_float(double value)
{
	if (!isfinite(value) || !isfinite((GLfloat)value)) {
		zend_value_error("uniform elements must be finite float32 numbers"); return 0;
	}
	return 1;
}

PHP_FUNCTION(glUniform1f)
{
	zend_long location; double x;
	PARSE("ld", &location, &x);
	if (!uniform_float(x)) { RETURN_THROWS(); }
	glUniform1f(location, x);
}
PHP_FUNCTION(glUniform2f)
{
	zend_long location; double x, y;
	PARSE("ldd", &location, &x, &y);
	if (!uniform_float(x) || !uniform_float(y)) { RETURN_THROWS(); }
	glUniform2f(location, x, y);
}
PHP_FUNCTION(glUniform3f)
{
	zend_long location; double x, y, z;
	PARSE("lddd", &location, &x, &y, &z);
	if (!uniform_float(x) || !uniform_float(y) || !uniform_float(z)) { RETURN_THROWS(); }
	glUniform3f(location, x, y, z);
}
PHP_FUNCTION(glUniform4f)
{
	zend_long location; double x, y, z, w;
	PARSE("ldddd", &location, &x, &y, &z, &w);
	if (!uniform_float(x) || !uniform_float(y) || !uniform_float(z) || !uniform_float(w)) { RETURN_THROWS(); }
	glUniform4f(location, x, y, z, w);
}
PHP_FUNCTION(glUniform1i)
{
	zend_long location; zend_long x;
	PARSE("ll", &location, &x);
	if (x < INT_MIN || x > INT_MAX) { zend_value_error("uniform elements must fit int32"); RETURN_THROWS(); }
	glUniform1i(location, x);
}
PHP_FUNCTION(glUniform2i)
{
	zend_long location; zend_long x, y;
	PARSE("lll", &location, &x, &y);
	if (x < INT_MIN || x > INT_MAX || y < INT_MIN || y > INT_MAX) { zend_value_error("uniform elements must fit int32"); RETURN_THROWS(); }
	glUniform2i(location, x, y);
}
PHP_FUNCTION(glUniform3i)
{
	zend_long location; zend_long x, y, z;
	PARSE("llll", &location, &x, &y, &z);
	if (x < INT_MIN || x > INT_MAX || y < INT_MIN || y > INT_MAX || z < INT_MIN || z > INT_MAX) { zend_value_error("uniform elements must fit int32"); RETURN_THROWS(); }
	glUniform3i(location, x, y, z);
}
PHP_FUNCTION(glUniform4i)
{
	zend_long location; zend_long x, y, z, w;
	PARSE("lllll", &location, &x, &y, &z, &w);
	if (x < INT_MIN || x > INT_MAX || y < INT_MIN || y > INT_MAX || z < INT_MIN || z > INT_MAX || w < INT_MIN || w > INT_MAX) { zend_value_error("uniform elements must fit int32"); RETURN_THROWS(); }
	glUniform4i(location, x, y, z, w);
}

static void *uniform_array(zval *values, zend_long count, int components, zend_bool integers)
{
	if (!nonnegative(count, "count") || (uint64_t)count * components != zend_hash_num_elements(Z_ARRVAL_P(values))) {
		zend_value_error("uniform data must contain exactly count*components elements"); return NULL;
	}
	void *data = safe_emalloc((size_t)count, components * sizeof(GLfloat), 0);
	size_t index = 0;
	zval *entry;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) {
		ZVAL_DEREF(entry);
		if (integers) {
			if (Z_TYPE_P(entry) != IS_LONG || Z_LVAL_P(entry) < INT_MIN || Z_LVAL_P(entry) > INT_MAX) {
				efree(data); zend_value_error("uniform elements must be int32 integers"); return NULL;
			}
			((GLint *)data)[index++] = Z_LVAL_P(entry);
		} else {
			if (Z_TYPE_P(entry) != IS_LONG && Z_TYPE_P(entry) != IS_DOUBLE) {
				efree(data); zend_type_error("uniform elements must be numbers"); return NULL;
			}
			double number = zval_get_double(entry);
			if (!uniform_float(number)) { efree(data); return NULL; }
			((GLfloat *)data)[index++] = number;
		}
	} ZEND_HASH_FOREACH_END();
	return data;
}

#define UNIFORM_VECTOR(name, components, integers) PHP_FUNCTION(name) \
{ zend_long location, count; zval *values; PARSE("lla", &location, &count, &values); \
	void *data = uniform_array(values, count, components, integers); if (!data) { RETURN_THROWS(); } \
	name(location, count, data); efree(data); }
UNIFORM_VECTOR(glUniform1fv, 1, 0)
UNIFORM_VECTOR(glUniform2fv, 2, 0)
UNIFORM_VECTOR(glUniform3fv, 3, 0)
UNIFORM_VECTOR(glUniform4fv, 4, 0)
UNIFORM_VECTOR(glUniform1iv, 1, 1)
UNIFORM_VECTOR(glUniform2iv, 2, 1)
UNIFORM_VECTOR(glUniform3iv, 3, 1)
UNIFORM_VECTOR(glUniform4iv, 4, 1)

#define UNIFORM_MATRIX(name, components) PHP_FUNCTION(name) \
{ zend_long location, count; zend_bool transpose; zval *values; PARSE("llba", &location, &count, &transpose, &values); \
	if (transpose) { zend_value_error("transpose must be false in WebGL"); RETURN_THROWS(); } \
	if (components != 4 && components != 9 && components != 16 && !php_webgl_require_3()) { RETURN_THROWS(); } \
	GLfloat *data = uniform_array(values, count, components, 0); if (!data) { RETURN_THROWS(); } \
	name(location, count, GL_FALSE, data); efree(data); }
UNIFORM_MATRIX(glUniformMatrix2fv, 4)
UNIFORM_MATRIX(glUniformMatrix3fv, 9)
UNIFORM_MATRIX(glUniformMatrix4fv, 16)
UNIFORM_MATRIX(glUniformMatrix2x3fv, 6)
UNIFORM_MATRIX(glUniformMatrix3x2fv, 6)
UNIFORM_MATRIX(glUniformMatrix2x4fv, 8)
UNIFORM_MATRIX(glUniformMatrix4x2fv, 8)
UNIFORM_MATRIX(glUniformMatrix3x4fv, 12)
UNIFORM_MATRIX(glUniformMatrix4x3fv, 12)

/* Numeric GL object handles stay owned by their SDL context. PHP uploads never
 * accept raw heap pointers: buffer-relative offsets and checked bytes only. */
#define OBJECT_ARRAY(function, helper, kind) PHP_FUNCTION(function) { helper(INTERNAL_FUNCTION_PARAM_PASSTHRU, kind); }
OBJECT_ARRAY(glGenBuffers, php_webgl_generate, PHP_WEBGL_BUFFER)
OBJECT_ARRAY(glGenTextures, php_webgl_generate, PHP_WEBGL_TEXTURE)
OBJECT_ARRAY(glGenVertexArrays, php_webgl_generate, PHP_WEBGL_VERTEX_ARRAY)
OBJECT_ARRAY(glGenFramebuffers, php_webgl_generate, PHP_WEBGL_FRAMEBUFFER)
OBJECT_ARRAY(glDeleteBuffers, php_webgl_delete, PHP_WEBGL_BUFFER)
OBJECT_ARRAY(glDeleteTextures, php_webgl_delete, PHP_WEBGL_TEXTURE)
OBJECT_ARRAY(glDeleteVertexArrays, php_webgl_delete, PHP_WEBGL_VERTEX_ARRAY)
OBJECT_ARRAY(glDeleteFramebuffers, php_webgl_delete, PHP_WEBGL_FRAMEBUFFER)
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
	if (!php_webgl_vertex_layout(index, size, type, stride, offset, 0)) { RETURN_THROWS(); }
	glVertexAttribPointer((GLuint)index, (GLint)size, (GLenum)type, normalized, (GLsizei)stride, (void *)(uintptr_t)offset);
}
PHP_FUNCTION(glDrawArrays)
{
	zend_long mode, first, count; PARSE("lll", &mode, &first, &count);
	if (!nonnegative(first, "first") || !nonnegative(count, "count")) { RETURN_THROWS(); }
	glDrawArrays((GLenum)mode, (GLint)first, (GLsizei)count);
}
zend_bool php_webgl_index_range(zend_long count, zend_long type, zend_long offset)
{
	GLint buffer = 0, bytes = 0;
	glGetIntegerv(GL_ELEMENT_ARRAY_BUFFER_BINDING, &buffer);
	int element = type == GL_UNSIGNED_BYTE ? 1 : type == GL_UNSIGNED_SHORT ? 2 : type == GL_UNSIGNED_INT ? 4 : 0;
	if (!buffer || !element || !nonnegative(offset, "offset") || !nonnegative(count, "count")) {
		if (!EG(exception)) { zend_value_error("indexed drawing requires a bound index buffer, unsigned index type and valid offset/count"); }
		return 0;
	}
	glGetBufferParameteriv(GL_ELEMENT_ARRAY_BUFFER, GL_BUFFER_SIZE, &bytes);
	if (offset % element || (uint64_t)offset + (uint64_t)count * element > (uint64_t)bytes) {
		zend_value_error("indices exceed the bound index buffer or have an unaligned offset"); return 0;
	}
	return 1;
}
PHP_FUNCTION(glDrawElements)
{
	zend_long mode, count, type, offset; PARSE("llll", &mode, &count, &type, &offset);
	if (!php_webgl_index_range(count, type, offset)) { RETURN_THROWS(); }
	glDrawElements((GLenum)mode, (GLsizei)count, (GLenum)type, (void *)(uintptr_t)offset);
}
PHP_FUNCTION(glFramebufferTexture2D)
{
	zend_long a,b,c,d,e; PARSE("lllll", &a,&b,&c,&d,&e);
	glFramebufferTexture2D((GLenum)a,(GLenum)b,(GLenum)c,(GLuint)d,(GLint)e);
}
PHP_FUNCTION(glCheckFramebufferStatus) { zend_long a; PARSE("l", &a); RETURN_LONG(glCheckFramebufferStatus((GLenum)a)); }

PHP_MINIT_FUNCTION(opengl)
{
	php_webgl_objects_init();
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
	php_webgl_extra_constants(module_number);
	return SUCCESS;
}
PHP_MSHUTDOWN_FUNCTION(opengl)
{
	php_webgl_objects_shutdown();
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
	PHP_MINIT(opengl), PHP_MSHUTDOWN(opengl), NULL, NULL, PHP_MINFO(opengl), "0.9.0", STANDARD_MODULE_PROPERTIES
};
#ifdef COMPILE_DL_OPENGL
ZEND_GET_MODULE(opengl)
#endif
