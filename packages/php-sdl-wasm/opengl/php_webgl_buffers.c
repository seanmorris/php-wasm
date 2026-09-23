/* WebGL2 vertex input, uniform buffers and reflection. PHP License 3.01. */
#include "php_webgl.h"
#include <inttypes.h>

zend_bool php_webgl_vertex_layout(zend_long index, zend_long size, zend_long type, zend_long stride, zend_long offset, zend_bool integer)
{
	GLint buffer = 0, limit = 0;
	glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &buffer);
	glGetIntegerv(GL_MAX_VERTEX_ATTRIBS, &limit);
	int unit = type == GL_BYTE || type == GL_UNSIGNED_BYTE ? 1
		: type == GL_SHORT || type == GL_UNSIGNED_SHORT ? 2
		: type == GL_INT || type == GL_UNSIGNED_INT ? 4 : 0;
	zend_bool packed = type == GL_INT_2_10_10_10_REV || type == GL_UNSIGNED_INT_2_10_10_10_REV;
	if (!integer && (type == GL_FLOAT || packed)) { unit = 4; }
	if (!integer && type == GL_HALF_FLOAT) { unit = 2; }
	if (!buffer || index < 0 || index >= limit || size < 1 || size > 4 || !unit
		|| (packed && size != 4) || stride < 0 || stride > 255 || offset < 0 || offset > INT_MAX
		|| stride % unit || offset % unit) {
		zend_value_error("vertex attributes require a bound buffer, valid index/type/size and aligned offset/stride (0..255)"); return 0;
	}
	/* Layouts may be configured before storage is uploaded or resized. WebGL
	 * checks fetch bounds at draw time; no PHP memory is read by this call. */
	return 1;
}

PHP_FUNCTION(glVertexAttribIPointer)
{
	zend_long index, size, type, stride, offset;
	PARSE3("lllll", &index, &size, &type, &stride, &offset);
	if (!php_webgl_vertex_layout(index, size, type, stride, offset, 1)) { RETURN_THROWS(); }
	glVertexAttribIPointer(index, size, type, stride, (void *)(uintptr_t)offset);
}

PHP_FUNCTION(glVertexAttribDivisor)
{
	zend_long index, divisor; PARSE3("ll", &index, &divisor);
	GLint limit = 0; glGetIntegerv(GL_MAX_VERTEX_ATTRIBS, &limit);
	if (index < 0 || index >= limit || !nonnegative(divisor, "divisor")) {
		if (!EG(exception)) { zend_value_error("attribute index is out of range"); } RETURN_THROWS();
	}
	glVertexAttribDivisor(index, divisor);
}

PHP_FUNCTION(glDrawArraysInstanced)
{
	zend_long mode, first, count, instances; PARSE3("llll", &mode, &first, &count, &instances);
	if (!nonnegative(first, "first") || !nonnegative(count, "count") || !nonnegative(instances, "instances")) { RETURN_THROWS(); }
	if (first > INT_MAX - count) { zend_value_error("vertex range is too large"); RETURN_THROWS(); }
	glDrawArraysInstanced(mode, first, count, instances);
}

PHP_FUNCTION(glDrawElementsInstanced)
{
	zend_long mode, count, type, offset, instances; PARSE3("lllll", &mode, &count, &type, &offset, &instances);
	if (!nonnegative(instances, "instances") || !php_webgl_index_range(count, type, offset)) { RETURN_THROWS(); }
	glDrawElementsInstanced(mode, count, type, (void *)(uintptr_t)offset, instances);
}

static GLenum buffer_binding(GLenum target)
{
	switch (target) {
	case GL_ARRAY_BUFFER: return GL_ARRAY_BUFFER_BINDING;
	case GL_ELEMENT_ARRAY_BUFFER: return GL_ELEMENT_ARRAY_BUFFER_BINDING;
	case GL_UNIFORM_BUFFER: return GL_UNIFORM_BUFFER_BINDING;
	case GL_TRANSFORM_FEEDBACK_BUFFER: return GL_TRANSFORM_FEEDBACK_BUFFER_BINDING;
	case GL_COPY_READ_BUFFER: return GL_COPY_READ_BUFFER_BINDING;
	case GL_COPY_WRITE_BUFFER: return GL_COPY_WRITE_BUFFER_BINDING;
	case GL_PIXEL_PACK_BUFFER: return GL_PIXEL_PACK_BUFFER_BINDING;
	case GL_PIXEL_UNPACK_BUFFER: return GL_PIXEL_UNPACK_BUFFER_BINDING;
	default: return 0;
	}
}

static zend_bool buffer_range(GLenum target, zend_long offset, zend_long size)
{
	GLenum binding = buffer_binding(target);
	GLint buffer = 0, bytes = 0;
	if (!binding) { zend_value_error("unsupported buffer target"); return 0; }
	glGetIntegerv(binding, &buffer);
	if (!buffer) { zend_value_error("a buffer must be bound to this target"); return 0; }
	if (!nonnegative(offset, "offset") || !nonnegative(size, "size")) { return 0; }
	glGetBufferParameteriv(target, GL_BUFFER_SIZE, &bytes);
	if (bytes < 0 || (uint64_t)offset + size > (uint64_t)bytes) {
		zend_value_error("range exceeds buffer storage"); return 0;
	}
	return 1;
}

static zend_bool binding_index(GLenum target, zend_long index)
{
	GLint limit = 0;
	if (target == GL_UNIFORM_BUFFER) { glGetIntegerv(GL_MAX_UNIFORM_BUFFER_BINDINGS, &limit); }
	else if (target == GL_TRANSFORM_FEEDBACK_BUFFER) { glGetIntegerv(GL_MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS, &limit); }
	else { zend_value_error("indexed binding requires UNIFORM_BUFFER or TRANSFORM_FEEDBACK_BUFFER"); return 0; }
	if (index < 0 || index >= limit) { zend_value_error("buffer binding index is out of range"); return 0; }
	return 1;
}

PHP_FUNCTION(glBindBufferBase)
{
	zend_long target, index, buffer; PARSE3("lll", &target, &index, &buffer);
	if (!binding_index(target, index) || !nonnegative(buffer, "buffer")) { RETURN_THROWS(); }
	if (buffer && !glIsBuffer(buffer)) { zend_value_error("buffer is not live"); RETURN_THROWS(); }
	glBindBufferBase(target, index, buffer);
}

PHP_FUNCTION(glBindBufferRange)
{
	zend_long target, index, buffer, offset, size; PARSE3("lllll", &target, &index, &buffer, &offset, &size);
	if (!binding_index(target, index) || !nonnegative(buffer, "buffer")
		|| !nonnegative(offset, "offset") || !nonnegative(size, "size")) { RETURN_THROWS(); }
	if (buffer) {
		GLint alignment = 4, previous = 0;
		if (target == GL_UNIFORM_BUFFER) { glGetIntegerv(GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT, &alignment); }
		if (size == 0 || alignment <= 0 || offset % alignment || (target == GL_TRANSFORM_FEEDBACK_BUFFER && size % 4)) {
			zend_value_error("indexed buffer range must have positive size and proper alignment"); RETURN_THROWS();
		}
		if (!glIsBuffer(buffer)) { zend_value_error("buffer is not live"); RETURN_THROWS(); }
		glGetIntegerv(buffer_binding(target), &previous);
		glBindBuffer(target, buffer);
		zend_bool valid = buffer_range(target, offset, size);
		glBindBuffer(target, previous);
		if (!valid) { RETURN_THROWS(); }
	}
	glBindBufferRange(target, index, buffer, offset, size);
}

PHP_FUNCTION(glGetBufferParameteriv)
{
	zend_long target, parameter; PARSE3("ll", &target, &parameter);
	if (!buffer_binding(target) || (parameter != GL_BUFFER_SIZE && parameter != GL_BUFFER_USAGE)) {
		zend_value_error("buffer query requires a supported target and BUFFER_SIZE or BUFFER_USAGE"); RETURN_THROWS();
	}
	GLint value = 0; glGetBufferParameteriv(target, parameter, &value); RETURN_LONG(value);
}

PHP_FUNCTION(glCopyBufferSubData)
{
	zend_long read, write, from, to, size; PARSE3("lllll", &read, &write, &from, &to, &size);
	if (!buffer_range(read, from, size) || !buffer_range(write, to, size)) { RETURN_THROWS(); }
	GLint input = 0, output = 0;
	glGetIntegerv(buffer_binding(read), &input); glGetIntegerv(buffer_binding(write), &output);
	if (input == output && size && (uint64_t)from < (uint64_t)to + size && (uint64_t)to < (uint64_t)from + size) {
		zend_value_error("ranges in the same buffer must not overlap"); RETURN_THROWS();
	}
	glCopyBufferSubData(read, write, from, to, size);
}

PHP_FUNCTION(glGetIntegeri_v)
{
	zend_long parameter, index; PARSE3("ll", &parameter, &index);
	GLenum target;
	switch (parameter) {
	case GL_UNIFORM_BUFFER_BINDING: case GL_UNIFORM_BUFFER_START: case GL_UNIFORM_BUFFER_SIZE:
		target = GL_UNIFORM_BUFFER; break;
	case GL_TRANSFORM_FEEDBACK_BUFFER_BINDING: case GL_TRANSFORM_FEEDBACK_BUFFER_START: case GL_TRANSFORM_FEEDBACK_BUFFER_SIZE:
		target = GL_TRANSFORM_FEEDBACK_BUFFER; break;
	default: zend_value_error("unsupported indexed buffer query"); RETURN_THROWS();
	}
	if (!binding_index(target, index)) { RETURN_THROWS(); }
	GLint value = 0; glGetIntegeri_v(parameter, index, &value); RETURN_LONG(value);
}

static zend_bool symbol_valid(zend_string *name)
{
	if (memchr(ZSTR_VAL(name), 0, ZSTR_LEN(name))) { zend_value_error("symbol names must not contain NUL"); return 0; }
	return 1;
}

static zend_bool program_valid(GLuint program)
{
	if (!glIsProgram(program)) { zend_value_error("program is not live"); return 0; }
	return 1;
}

PHP_FUNCTION(glGetUniformBlockIndex)
{
	zend_long program; zend_string *name; PARSE3("lS", &program, &name);
	if (!program_valid(program) || !symbol_valid(name)) { RETURN_THROWS(); }
	GLuint index = glGetUniformBlockIndex(program, ZSTR_VAL(name));
	RETURN_LONG(index == GL_INVALID_INDEX ? -1 : (zend_long)index);
}

static zend_bool block_valid(GLuint program, zend_long block);

PHP_FUNCTION(glUniformBlockBinding)
{
	zend_long program, block, binding; PARSE3("lll", &program, &block, &binding);
	if (!block_valid(program, block) || !binding_index(GL_UNIFORM_BUFFER, binding)) { RETURN_THROWS(); }
	glUniformBlockBinding(program, block, binding);
}

static void active_item(INTERNAL_FUNCTION_PARAMETERS, zend_bool uniform)
{
	zend_long program, index; PARSE3("ll", &program, &index);
	if (!program_valid(program)) { RETURN_THROWS(); }
	GLint count = 0, length = 0;
	glGetProgramiv(program, uniform ? GL_ACTIVE_UNIFORMS : GL_ACTIVE_ATTRIBUTES, &count);
	if (index < 0 || index >= count) { zend_value_error("active symbol index is out of range"); RETURN_THROWS(); }
	glGetProgramiv(program, uniform ? GL_ACTIVE_UNIFORM_MAX_LENGTH : GL_ACTIVE_ATTRIBUTE_MAX_LENGTH, &length);
	if (length <= 0) { RETURN_NULL(); }
	zend_string *name = zend_string_alloc(length, 0);
	GLsizei written = 0; GLint size = 0; GLenum type = 0;
	if (uniform) { glGetActiveUniform(program, index, length, &written, &size, &type, ZSTR_VAL(name)); }
	else { glGetActiveAttrib(program, index, length, &written, &size, &type, ZSTR_VAL(name)); }
	if (written < 0 || written >= length) { zend_string_release(name); zend_throw_error(NULL, "invalid native symbol length"); RETURN_THROWS(); }
	ZSTR_LEN(name) = written; ZSTR_VAL(name)[written] = 0;
	array_init(return_value);
	add_assoc_str(return_value, "name", name); add_assoc_long(return_value, "size", size); add_assoc_long(return_value, "type", type);
}
PHP_FUNCTION(glGetActiveUniform) { active_item(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1); }
PHP_FUNCTION(glGetActiveAttrib) { active_item(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0); }

PHP_FUNCTION(glGetUniformIndices)
{
	zend_long program; zval *names, *entry; PARSE3("la", &program, &names);
	if (!program_valid(program)) { RETURN_THROWS(); }
	size_t count = zend_hash_num_elements(Z_ARRVAL_P(names));
	if (count > INT_MAX) { zend_value_error("too many uniform names"); RETURN_THROWS(); }
	const GLchar **strings = safe_emalloc(count, sizeof(*strings), 0);
	size_t index = 0;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(names), entry) {
		ZVAL_DEREF(entry);
		if (Z_TYPE_P(entry) != IS_STRING) { efree(strings); zend_type_error("uniform names must be strings"); RETURN_THROWS(); }
		if (!symbol_valid(Z_STR_P(entry))) { efree(strings); RETURN_THROWS(); }
		strings[index++] = Z_STRVAL_P(entry);
	} ZEND_HASH_FOREACH_END();
	GLuint *indices = safe_emalloc(count, sizeof(*indices), 0);
	for (index = 0; index < count; index++) { indices[index] = GL_INVALID_INDEX; }
	glGetUniformIndices(program, count, strings, indices);
	array_init(return_value);
	for (index = 0; index < count; index++) { add_next_index_long(return_value, indices[index] == GL_INVALID_INDEX ? -1 : (zend_long)indices[index]); }
	efree(indices); efree(strings);
}

PHP_FUNCTION(glGetActiveUniformsiv)
{
	zend_long program, parameter; zval *values, *entry; PARSE3("lal", &program, &values, &parameter);
	if (!program_valid(program)) { RETURN_THROWS(); }
	switch (parameter) {
	case GL_UNIFORM_TYPE: case GL_UNIFORM_SIZE: case GL_UNIFORM_NAME_LENGTH: case GL_UNIFORM_BLOCK_INDEX:
	case GL_UNIFORM_OFFSET: case GL_UNIFORM_ARRAY_STRIDE: case GL_UNIFORM_MATRIX_STRIDE: case GL_UNIFORM_IS_ROW_MAJOR: break;
	default: zend_value_error("unsupported uniform layout query"); RETURN_THROWS();
	}
	GLint active = 0; glGetProgramiv(program, GL_ACTIVE_UNIFORMS, &active);
	size_t count = zend_hash_num_elements(Z_ARRVAL_P(values)), index = 0;
	if (count > INT_MAX) { zend_value_error("too many uniform indices"); RETURN_THROWS(); }
	GLuint *indices = safe_emalloc(count, sizeof(*indices), 0);
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) {
		ZVAL_DEREF(entry);
		if (Z_TYPE_P(entry) != IS_LONG || Z_LVAL_P(entry) < 0 || Z_LVAL_P(entry) >= active) {
			efree(indices); zend_value_error("uniform index is out of range"); RETURN_THROWS();
		}
		indices[index++] = Z_LVAL_P(entry);
	} ZEND_HASH_FOREACH_END();
	GLint *result = ecalloc(count, sizeof(*result));
	if (parameter == GL_UNIFORM_NAME_LENGTH) {
		/* WebGL getActiveUniforms omits this GLES selector. Query actual names. */
		GLint length = 0; glGetProgramiv(program, GL_ACTIVE_UNIFORM_MAX_LENGTH, &length);
		char *name = emalloc(length > 0 ? length : 1);
		for (index = 0; index < count && length > 0; index++) {
			GLsizei written = 0; GLint size = 0; GLenum type = 0;
			glGetActiveUniform(program, indices[index], length, &written, &size, &type, name);
			result[index] = written + 1;
		}
		efree(name);
	} else { glGetActiveUniformsiv(program, count, indices, parameter, result); }
	array_init(return_value);
	for (index = 0; index < count; index++) { add_next_index_long(return_value, result[index]); }
	efree(result); efree(indices);
}

static zend_bool block_valid(GLuint program, zend_long block)
{
	if (!program_valid(program)) { return 0; }
	GLint count = 0; glGetProgramiv(program, GL_ACTIVE_UNIFORM_BLOCKS, &count);
	if (block < 0 || block >= count) { zend_value_error("uniform block index is out of range"); return 0; }
	return 1;
}

PHP_FUNCTION(glGetActiveUniformBlockiv)
{
	zend_long program, block, parameter; PARSE3("lll", &program, &block, &parameter);
	if (!block_valid(program, block)) { RETURN_THROWS(); }
	switch (parameter) {
	case GL_UNIFORM_BLOCK_BINDING: case GL_UNIFORM_BLOCK_DATA_SIZE: case GL_UNIFORM_BLOCK_NAME_LENGTH:
	case GL_UNIFORM_BLOCK_ACTIVE_UNIFORMS: case GL_UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES:
	case GL_UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER: case GL_UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER: break;
	default: zend_value_error("unsupported uniform block query"); RETURN_THROWS();
	}
	if (parameter != GL_UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES) {
		GLint value = 0; glGetActiveUniformBlockiv(program, block, parameter, &value); RETURN_LONG(value);
	}
	GLint count = 0; glGetActiveUniformBlockiv(program, block, GL_UNIFORM_BLOCK_ACTIVE_UNIFORMS, &count);
	array_init(return_value);
	if (count <= 0) { return; }
	GLint *indices = ecalloc(count, sizeof(*indices));
	glGetActiveUniformBlockiv(program, block, parameter, indices);
	for (GLint index = 0; index < count; index++) { add_next_index_long(return_value, indices[index]); }
	efree(indices);
}

PHP_FUNCTION(glGetActiveUniformBlockName)
{
	zend_long program, block; PARSE3("ll", &program, &block);
	if (!block_valid(program, block)) { RETURN_THROWS(); }
	GLint length = 0; glGetActiveUniformBlockiv(program, block, GL_UNIFORM_BLOCK_NAME_LENGTH, &length);
	if (length <= 0) { RETURN_NULL(); }
	zend_string *name = zend_string_alloc(length, 0); GLsizei written = 0;
	glGetActiveUniformBlockName(program, block, length, &written, ZSTR_VAL(name));
	if (written < 0 || written >= length) { zend_string_release(name); zend_throw_error(NULL, "invalid native block name length"); RETURN_THROWS(); }
	ZSTR_LEN(name) = written; ZSTR_VAL(name)[written] = 0; RETURN_STR(name);
}

/* Exact unsigned uniforms also work on wasm32, whose PHP int is signed 32-bit. */
static zend_bool uint32_value(zval *value, GLuint *result)
{
	ZVAL_DEREF(value);
	uint64_t number = 0;
	if (Z_TYPE_P(value) == IS_LONG && Z_LVAL_P(value) >= 0) { number = Z_LVAL_P(value); }
	else if (Z_TYPE_P(value) == IS_STRING && Z_STRLEN_P(value) && Z_STRLEN_P(value) <= 10) {
		for (size_t i = 0; i < Z_STRLEN_P(value); i++) {
			unsigned char digit = Z_STRVAL_P(value)[i];
			if (digit < '0' || digit > '9') { zend_value_error("unsigned uniforms require uint32 integers or decimal strings"); return 0; }
			number = number * 10 + digit - '0';
		}
	} else { zend_value_error("unsigned uniforms require uint32 integers or decimal strings"); return 0; }
	if (number > UINT32_MAX) { zend_value_error("unsigned uniform exceeds uint32"); return 0; }
	*result = (GLuint)number; return 1;
}

static void unsigned_uniform(INTERNAL_FUNCTION_PARAMETERS, int components, zend_bool vector)
{
	zend_long location, count = 1;
	zval *values = NULL, *a = NULL, *b = NULL, *c = NULL, *d = NULL;
	if (vector) { PARSE3("lla", &location, &count, &values); }
	else {
		switch (components) {
		case 1: PARSE3("lz", &location, &a); break;
		case 2: PARSE3("lzz", &location, &a, &b); break;
		case 3: PARSE3("lzzz", &location, &a, &b, &c); break;
		case 4: PARSE3("lzzzz", &location, &a, &b, &c, &d); break;
		}
	}
	if (!nonnegative(count, "count")) { RETURN_THROWS(); }
	if (vector && (uint64_t)count * components != zend_hash_num_elements(Z_ARRVAL_P(values))) {
		zend_value_error("uniform data must contain exactly count*components elements"); RETURN_THROWS();
	}
	GLuint *data = safe_emalloc(count, components * sizeof(*data), 0);
	size_t index = 0;
	if (vector) {
		zval *entry;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) {
			if (!uint32_value(entry, &data[index++])) { efree(data); RETURN_THROWS(); }
		} ZEND_HASH_FOREACH_END();
	} else {
		zval *entries[] = {a, b, c, d};
		for (index = 0; index < components; index++) {
			if (!uint32_value(entries[index], &data[index])) { efree(data); RETURN_THROWS(); }
		}
	}
	switch (components) {
	case 1: glUniform1uiv(location, count, data); break;
	case 2: glUniform2uiv(location, count, data); break;
	case 3: glUniform3uiv(location, count, data); break;
	case 4: glUniform4uiv(location, count, data); break;
	}
	efree(data);
}
#define UNSIGNED_UNIFORM(count) \
PHP_FUNCTION(glUniform##count##ui) { unsigned_uniform(INTERNAL_FUNCTION_PARAM_PASSTHRU, count, 0); } \
PHP_FUNCTION(glUniform##count##uiv) { unsigned_uniform(INTERNAL_FUNCTION_PARAM_PASSTHRU, count, 1); }
UNSIGNED_UNIFORM(1)
UNSIGNED_UNIFORM(2)
UNSIGNED_UNIFORM(3)
UNSIGNED_UNIFORM(4)
