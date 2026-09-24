/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: a9aee07e984f1e26b57112b0d26ed7d63878d8d4 */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetString, 0, 1, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetError, 0, 0, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_MASK_EX(arginfo_glGetIntegerv, 0, 1, MAY_BE_LONG|MAY_BE_ARRAY)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_MASK_EX(arginfo_glGetFloatv, 0, 1, MAY_BE_DOUBLE|MAY_BE_ARRAY)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_MASK_EX(arginfo_glGetBooleanv, 0, 1, MAY_BE_BOOL|MAY_BE_ARRAY)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetStringi, 0, 2, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glClear, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, mask, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glClearColor, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, red, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, green, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, blue, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, alpha, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glClearDepth, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, depth, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glClearStencil, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glEnable, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, capability, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glDisable arginfo_glEnable

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsEnabled, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, capability, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glViewport, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glScissor arginfo_glViewport

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDepthFunc, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDepthMask, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, enabled, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCullFace, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glFrontFace arginfo_glCullFace

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBlendFunc, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, destination, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glPixelStorei, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glFlush, 0, 0, IS_VOID, 0)
ZEND_END_ARG_INFO()

#define arginfo_glFinish arginfo_glFlush

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCreateShader, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glShaderSource, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, shader, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, length, IS_LONG, 0, "0")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCompileShader, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, shader, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetShaderiv, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, shader, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetShaderInfoLog, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, shader, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glDeleteShader arginfo_glCompileShader

#define arginfo_glCreateProgram arginfo_glGetError

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glAttachShader, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, shader, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glDetachShader arginfo_glAttachShader

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glLinkProgram, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetProgramiv, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetProgramInfoLog, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glUseProgram arginfo_glLinkProgram

#define arginfo_glDeleteProgram arginfo_glLinkProgram

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetAttribLocation, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_glGetUniformLocation arginfo_glGetAttribLocation

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform1f, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform2f, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform3f, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, z, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform4f, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, z, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, w, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform1i, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform2i, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform3i, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, z, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform4i, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, z, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, w, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform1fv, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, values, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_glUniform2fv arginfo_glUniform1fv

#define arginfo_glUniform3fv arginfo_glUniform1fv

#define arginfo_glUniform4fv arginfo_glUniform1fv

#define arginfo_glUniform1iv arginfo_glUniform1fv

#define arginfo_glUniform2iv arginfo_glUniform1fv

#define arginfo_glUniform3iv arginfo_glUniform1fv

#define arginfo_glUniform4iv arginfo_glUniform1fv

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniformMatrix2fv, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, transpose, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, values, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_glUniformMatrix3fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix4fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix2x3fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix3x2fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix2x4fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix4x2fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix3x4fv arginfo_glUniformMatrix2fv

#define arginfo_glUniformMatrix4x3fv arginfo_glUniformMatrix2fv

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGenBuffers, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, buffers, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBindBuffer, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, buffer, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBufferData, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, size, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, usage, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBufferSubData, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, size, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDeleteBuffers, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, buffers, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGenVertexArrays, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, arrays, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBindVertexArray, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, array, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDeleteVertexArrays, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, arrays, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glEnableVertexAttribArray, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glDisableVertexAttribArray arginfo_glEnableVertexAttribArray

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glVertexAttribPointer, 0, 6, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, size, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, normalized, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, stride, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDrawArrays, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, first, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDrawElements, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGenTextures, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, textures, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBindTexture, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, texture, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glActiveTexture, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, texture, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexParameteri, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexParameterf, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetTexParameteriv, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetTexParameterfv, 0, 2, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexImage2D, 0, 9, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, internalFormat, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, border, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, pixels, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexSubImage2D, 0, 9, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, pixels, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexImage3D, 0, 10, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, internalFormat, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depth, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, border, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, pixels, IS_STRING, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexSubImage3D, 0, 11, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, z, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depth, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, pixels, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexStorage2D, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, levels, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, internalFormat, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glTexStorage3D, 0, 6, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, levels, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, internalFormat, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depth, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCompressedTexImage2D, 0, 8, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, internalFormat, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, border, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, imageSize, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCompressedTexSubImage2D, 0, 9, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, imageSize, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCompressedTexImage3D, 0, 9, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, internalFormat, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depth, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, border, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, imageSize, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCompressedTexSubImage3D, 0, 11, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, z, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depth, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, imageSize, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGenerateMipmap, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDeleteTextures, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, textures, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGenSamplers, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, samplers, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDeleteSamplers, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, samplers, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsSampler, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, sampler, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBindSampler, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, unit, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, sampler, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glSamplerParameteri, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, sampler, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glSamplerParameterf, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, sampler, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetSamplerParameteriv, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, sampler, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetSamplerParameterfv, 0, 2, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, sampler, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glReadPixels, 0, 6, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, x, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glGenFramebuffers arginfo_glGenBuffers

#define arginfo_glBindFramebuffer arginfo_glBindBuffer

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glFramebufferTexture2D, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, attachment, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, textureTarget, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, texture, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCheckFramebufferStatus, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glDeleteFramebuffers arginfo_glDeleteBuffers

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glVertexAttribIPointer, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, size, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, stride, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glVertexAttribDivisor, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, divisor, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDrawArraysInstanced, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, first, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, instances, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDrawElementsInstanced, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, instances, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBindBufferBase, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, buffer, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBindBufferRange, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, buffer, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, size, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glGetBufferParameteriv arginfo_glGetTexParameteriv

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glCopyBufferSubData, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, readTarget, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, writeTarget, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, readOffset, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, writeOffset, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, size, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetIntegeri_v, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glGetUniformBlockIndex arginfo_glGetAttribLocation

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniformBlockBinding, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, block, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, binding, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetActiveUniform, 0, 2, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glGetActiveAttrib arginfo_glGetActiveUniform

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetUniformIndices, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, names, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetActiveUniformsiv, 0, 3, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, indices, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_MASK_EX(arginfo_glGetActiveUniformBlockiv, 0, 3, MAY_BE_LONG|MAY_BE_ARRAY)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, block, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetActiveUniformBlockName, 0, 2, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, block, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform1ui, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_MASK(0, x, MAY_BE_LONG|MAY_BE_STRING, NULL)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform2ui, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_MASK(0, x, MAY_BE_LONG|MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_MASK(0, y, MAY_BE_LONG|MAY_BE_STRING, NULL)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform3ui, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_MASK(0, x, MAY_BE_LONG|MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_MASK(0, y, MAY_BE_LONG|MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_MASK(0, z, MAY_BE_LONG|MAY_BE_STRING, NULL)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform4ui, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_MASK(0, x, MAY_BE_LONG|MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_MASK(0, y, MAY_BE_LONG|MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_MASK(0, z, MAY_BE_LONG|MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_MASK(0, w, MAY_BE_LONG|MAY_BE_STRING, NULL)
ZEND_END_ARG_INFO()

#define arginfo_glUniform1uiv arginfo_glUniform1fv

#define arginfo_glUniform2uiv arginfo_glUniform1fv

#define arginfo_glUniform3uiv arginfo_glUniform1fv

#define arginfo_glUniform4uiv arginfo_glUniform1fv

#define arginfo_glGenRenderbuffers arginfo_glGenBuffers

#define arginfo_glDeleteRenderbuffers arginfo_glDeleteBuffers

#define arginfo_glBindRenderbuffer arginfo_glBindBuffer

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glRenderbufferStorage, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glRenderbufferStorageMultisample, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, samples, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glFramebufferRenderbuffer, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, attachment, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, renderbufferTarget, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, buffer, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glFramebufferTextureLayer, 0, 5, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, attachment, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, texture, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, layer, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBlitFramebuffer, 0, 10, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, srcX0, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, srcY0, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, srcX1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, srcY1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dstX0, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dstY0, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dstX1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dstY1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, mask, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, filter, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glDrawBuffers arginfo_glDeleteBuffers

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glReadBuffer, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glGetRenderbufferParameteriv arginfo_glGetTexParameteriv

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetFramebufferAttachmentParameteriv, 0, 3, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, attachment, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_MASK_EX(arginfo_glGetInternalformativ, 0, 3, MAY_BE_LONG|MAY_BE_ARRAY)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, parameter, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBlendFuncSeparate, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, srcRGB, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dstRGB, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, srcAlpha, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dstAlpha, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glBlendEquation arginfo_glCullFace

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glBlendEquationSeparate, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, rgb, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, alpha, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glBlendColor arginfo_glClearColor

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glColorMask, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, red, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, green, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, blue, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, alpha, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glStencilFunc, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, reference, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, mask, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glStencilFuncSeparate, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, face, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, reference, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, mask, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glStencilOp, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, fail, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depthFail, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depthPass, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glStencilOpSeparate, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, face, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, fail, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depthFail, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, depthPass, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glStencilMask arginfo_glClear

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glStencilMaskSeparate, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, face, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, mask, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDepthRange, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, near, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, far, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glPolygonOffset, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, factor, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, units, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glLineWidth, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, width, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsBuffer, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, buffer, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsTexture, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, texture, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_glIsFramebuffer arginfo_glIsBuffer

#define arginfo_glIsRenderbuffer arginfo_glIsBuffer

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsVertexArray, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, array, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsShader, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, shader, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glIsProgram, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, program, IS_LONG, 0)
ZEND_END_ARG_INFO()


ZEND_FUNCTION(glGetString);
ZEND_FUNCTION(glGetError);
ZEND_FUNCTION(glGetIntegerv);
ZEND_FUNCTION(glGetFloatv);
ZEND_FUNCTION(glGetBooleanv);
ZEND_FUNCTION(glGetStringi);
ZEND_FUNCTION(glClear);
ZEND_FUNCTION(glClearColor);
ZEND_FUNCTION(glClearDepth);
ZEND_FUNCTION(glClearStencil);
ZEND_FUNCTION(glEnable);
ZEND_FUNCTION(glDisable);
ZEND_FUNCTION(glIsEnabled);
ZEND_FUNCTION(glViewport);
ZEND_FUNCTION(glScissor);
ZEND_FUNCTION(glDepthFunc);
ZEND_FUNCTION(glDepthMask);
ZEND_FUNCTION(glCullFace);
ZEND_FUNCTION(glFrontFace);
ZEND_FUNCTION(glBlendFunc);
ZEND_FUNCTION(glPixelStorei);
ZEND_FUNCTION(glFlush);
ZEND_FUNCTION(glFinish);
ZEND_FUNCTION(glCreateShader);
ZEND_FUNCTION(glShaderSource);
ZEND_FUNCTION(glCompileShader);
ZEND_FUNCTION(glGetShaderiv);
ZEND_FUNCTION(glGetShaderInfoLog);
ZEND_FUNCTION(glDeleteShader);
ZEND_FUNCTION(glCreateProgram);
ZEND_FUNCTION(glAttachShader);
ZEND_FUNCTION(glDetachShader);
ZEND_FUNCTION(glLinkProgram);
ZEND_FUNCTION(glGetProgramiv);
ZEND_FUNCTION(glGetProgramInfoLog);
ZEND_FUNCTION(glUseProgram);
ZEND_FUNCTION(glDeleteProgram);
ZEND_FUNCTION(glGetAttribLocation);
ZEND_FUNCTION(glGetUniformLocation);
ZEND_FUNCTION(glUniform1f);
ZEND_FUNCTION(glUniform2f);
ZEND_FUNCTION(glUniform3f);
ZEND_FUNCTION(glUniform4f);
ZEND_FUNCTION(glUniform1i);
ZEND_FUNCTION(glUniform2i);
ZEND_FUNCTION(glUniform3i);
ZEND_FUNCTION(glUniform4i);
ZEND_FUNCTION(glUniform1fv);
ZEND_FUNCTION(glUniform2fv);
ZEND_FUNCTION(glUniform3fv);
ZEND_FUNCTION(glUniform4fv);
ZEND_FUNCTION(glUniform1iv);
ZEND_FUNCTION(glUniform2iv);
ZEND_FUNCTION(glUniform3iv);
ZEND_FUNCTION(glUniform4iv);
ZEND_FUNCTION(glUniformMatrix2fv);
ZEND_FUNCTION(glUniformMatrix3fv);
ZEND_FUNCTION(glUniformMatrix4fv);
ZEND_FUNCTION(glUniformMatrix2x3fv);
ZEND_FUNCTION(glUniformMatrix3x2fv);
ZEND_FUNCTION(glUniformMatrix2x4fv);
ZEND_FUNCTION(glUniformMatrix4x2fv);
ZEND_FUNCTION(glUniformMatrix3x4fv);
ZEND_FUNCTION(glUniformMatrix4x3fv);
ZEND_FUNCTION(glGenBuffers);
ZEND_FUNCTION(glBindBuffer);
ZEND_FUNCTION(glBufferData);
ZEND_FUNCTION(glBufferSubData);
ZEND_FUNCTION(glDeleteBuffers);
ZEND_FUNCTION(glGenVertexArrays);
ZEND_FUNCTION(glBindVertexArray);
ZEND_FUNCTION(glDeleteVertexArrays);
ZEND_FUNCTION(glEnableVertexAttribArray);
ZEND_FUNCTION(glDisableVertexAttribArray);
ZEND_FUNCTION(glVertexAttribPointer);
ZEND_FUNCTION(glDrawArrays);
ZEND_FUNCTION(glDrawElements);
ZEND_FUNCTION(glGenTextures);
ZEND_FUNCTION(glBindTexture);
ZEND_FUNCTION(glActiveTexture);
ZEND_FUNCTION(glTexParameteri);
ZEND_FUNCTION(glTexParameterf);
ZEND_FUNCTION(glGetTexParameteriv);
ZEND_FUNCTION(glGetTexParameterfv);
ZEND_FUNCTION(glTexImage2D);
ZEND_FUNCTION(glTexSubImage2D);
ZEND_FUNCTION(glTexImage3D);
ZEND_FUNCTION(glTexSubImage3D);
ZEND_FUNCTION(glTexStorage2D);
ZEND_FUNCTION(glTexStorage3D);
ZEND_FUNCTION(glCompressedTexImage2D);
ZEND_FUNCTION(glCompressedTexSubImage2D);
ZEND_FUNCTION(glCompressedTexImage3D);
ZEND_FUNCTION(glCompressedTexSubImage3D);
ZEND_FUNCTION(glGenerateMipmap);
ZEND_FUNCTION(glDeleteTextures);
ZEND_FUNCTION(glGenSamplers);
ZEND_FUNCTION(glDeleteSamplers);
ZEND_FUNCTION(glIsSampler);
ZEND_FUNCTION(glBindSampler);
ZEND_FUNCTION(glSamplerParameteri);
ZEND_FUNCTION(glSamplerParameterf);
ZEND_FUNCTION(glGetSamplerParameteriv);
ZEND_FUNCTION(glGetSamplerParameterfv);
ZEND_FUNCTION(glReadPixels);
ZEND_FUNCTION(glGenFramebuffers);
ZEND_FUNCTION(glBindFramebuffer);
ZEND_FUNCTION(glFramebufferTexture2D);
ZEND_FUNCTION(glCheckFramebufferStatus);
ZEND_FUNCTION(glDeleteFramebuffers);
ZEND_FUNCTION(glVertexAttribIPointer);
ZEND_FUNCTION(glVertexAttribDivisor);
ZEND_FUNCTION(glDrawArraysInstanced);
ZEND_FUNCTION(glDrawElementsInstanced);
ZEND_FUNCTION(glBindBufferBase);
ZEND_FUNCTION(glBindBufferRange);
ZEND_FUNCTION(glGetBufferParameteriv);
ZEND_FUNCTION(glCopyBufferSubData);
ZEND_FUNCTION(glGetIntegeri_v);
ZEND_FUNCTION(glGetUniformBlockIndex);
ZEND_FUNCTION(glUniformBlockBinding);
ZEND_FUNCTION(glGetActiveUniform);
ZEND_FUNCTION(glGetActiveAttrib);
ZEND_FUNCTION(glGetUniformIndices);
ZEND_FUNCTION(glGetActiveUniformsiv);
ZEND_FUNCTION(glGetActiveUniformBlockiv);
ZEND_FUNCTION(glGetActiveUniformBlockName);
ZEND_FUNCTION(glUniform1ui);
ZEND_FUNCTION(glUniform2ui);
ZEND_FUNCTION(glUniform3ui);
ZEND_FUNCTION(glUniform4ui);
ZEND_FUNCTION(glUniform1uiv);
ZEND_FUNCTION(glUniform2uiv);
ZEND_FUNCTION(glUniform3uiv);
ZEND_FUNCTION(glUniform4uiv);
ZEND_FUNCTION(glGenRenderbuffers);
ZEND_FUNCTION(glDeleteRenderbuffers);
ZEND_FUNCTION(glBindRenderbuffer);
ZEND_FUNCTION(glRenderbufferStorage);
ZEND_FUNCTION(glRenderbufferStorageMultisample);
ZEND_FUNCTION(glFramebufferRenderbuffer);
ZEND_FUNCTION(glFramebufferTextureLayer);
ZEND_FUNCTION(glBlitFramebuffer);
ZEND_FUNCTION(glDrawBuffers);
ZEND_FUNCTION(glReadBuffer);
ZEND_FUNCTION(glGetRenderbufferParameteriv);
ZEND_FUNCTION(glGetFramebufferAttachmentParameteriv);
ZEND_FUNCTION(glGetInternalformativ);
ZEND_FUNCTION(glBlendFuncSeparate);
ZEND_FUNCTION(glBlendEquation);
ZEND_FUNCTION(glBlendEquationSeparate);
ZEND_FUNCTION(glBlendColor);
ZEND_FUNCTION(glColorMask);
ZEND_FUNCTION(glStencilFunc);
ZEND_FUNCTION(glStencilFuncSeparate);
ZEND_FUNCTION(glStencilOp);
ZEND_FUNCTION(glStencilOpSeparate);
ZEND_FUNCTION(glStencilMask);
ZEND_FUNCTION(glStencilMaskSeparate);
ZEND_FUNCTION(glDepthRange);
ZEND_FUNCTION(glPolygonOffset);
ZEND_FUNCTION(glLineWidth);
ZEND_FUNCTION(glIsBuffer);
ZEND_FUNCTION(glIsTexture);
ZEND_FUNCTION(glIsFramebuffer);
ZEND_FUNCTION(glIsRenderbuffer);
ZEND_FUNCTION(glIsVertexArray);
ZEND_FUNCTION(glIsShader);
ZEND_FUNCTION(glIsProgram);


static const zend_function_entry ext_functions[] = {
	ZEND_FE(glGetString, arginfo_glGetString)
	ZEND_FE(glGetError, arginfo_glGetError)
	ZEND_FE(glGetIntegerv, arginfo_glGetIntegerv)
	ZEND_FE(glGetFloatv, arginfo_glGetFloatv)
	ZEND_FE(glGetBooleanv, arginfo_glGetBooleanv)
	ZEND_FE(glGetStringi, arginfo_glGetStringi)
	ZEND_FE(glClear, arginfo_glClear)
	ZEND_FE(glClearColor, arginfo_glClearColor)
	ZEND_FE(glClearDepth, arginfo_glClearDepth)
	ZEND_FE(glClearStencil, arginfo_glClearStencil)
	ZEND_FE(glEnable, arginfo_glEnable)
	ZEND_FE(glDisable, arginfo_glDisable)
	ZEND_FE(glIsEnabled, arginfo_glIsEnabled)
	ZEND_FE(glViewport, arginfo_glViewport)
	ZEND_FE(glScissor, arginfo_glScissor)
	ZEND_FE(glDepthFunc, arginfo_glDepthFunc)
	ZEND_FE(glDepthMask, arginfo_glDepthMask)
	ZEND_FE(glCullFace, arginfo_glCullFace)
	ZEND_FE(glFrontFace, arginfo_glFrontFace)
	ZEND_FE(glBlendFunc, arginfo_glBlendFunc)
	ZEND_FE(glPixelStorei, arginfo_glPixelStorei)
	ZEND_FE(glFlush, arginfo_glFlush)
	ZEND_FE(glFinish, arginfo_glFinish)
	ZEND_FE(glCreateShader, arginfo_glCreateShader)
	ZEND_FE(glShaderSource, arginfo_glShaderSource)
	ZEND_FE(glCompileShader, arginfo_glCompileShader)
	ZEND_FE(glGetShaderiv, arginfo_glGetShaderiv)
	ZEND_FE(glGetShaderInfoLog, arginfo_glGetShaderInfoLog)
	ZEND_FE(glDeleteShader, arginfo_glDeleteShader)
	ZEND_FE(glCreateProgram, arginfo_glCreateProgram)
	ZEND_FE(glAttachShader, arginfo_glAttachShader)
	ZEND_FE(glDetachShader, arginfo_glDetachShader)
	ZEND_FE(glLinkProgram, arginfo_glLinkProgram)
	ZEND_FE(glGetProgramiv, arginfo_glGetProgramiv)
	ZEND_FE(glGetProgramInfoLog, arginfo_glGetProgramInfoLog)
	ZEND_FE(glUseProgram, arginfo_glUseProgram)
	ZEND_FE(glDeleteProgram, arginfo_glDeleteProgram)
	ZEND_FE(glGetAttribLocation, arginfo_glGetAttribLocation)
	ZEND_FE(glGetUniformLocation, arginfo_glGetUniformLocation)
	ZEND_FE(glUniform1f, arginfo_glUniform1f)
	ZEND_FE(glUniform2f, arginfo_glUniform2f)
	ZEND_FE(glUniform3f, arginfo_glUniform3f)
	ZEND_FE(glUniform4f, arginfo_glUniform4f)
	ZEND_FE(glUniform1i, arginfo_glUniform1i)
	ZEND_FE(glUniform2i, arginfo_glUniform2i)
	ZEND_FE(glUniform3i, arginfo_glUniform3i)
	ZEND_FE(glUniform4i, arginfo_glUniform4i)
	ZEND_FE(glUniform1fv, arginfo_glUniform1fv)
	ZEND_FE(glUniform2fv, arginfo_glUniform2fv)
	ZEND_FE(glUniform3fv, arginfo_glUniform3fv)
	ZEND_FE(glUniform4fv, arginfo_glUniform4fv)
	ZEND_FE(glUniform1iv, arginfo_glUniform1iv)
	ZEND_FE(glUniform2iv, arginfo_glUniform2iv)
	ZEND_FE(glUniform3iv, arginfo_glUniform3iv)
	ZEND_FE(glUniform4iv, arginfo_glUniform4iv)
	ZEND_FE(glUniformMatrix2fv, arginfo_glUniformMatrix2fv)
	ZEND_FE(glUniformMatrix3fv, arginfo_glUniformMatrix3fv)
	ZEND_FE(glUniformMatrix4fv, arginfo_glUniformMatrix4fv)
	ZEND_FE(glUniformMatrix2x3fv, arginfo_glUniformMatrix2x3fv)
	ZEND_FE(glUniformMatrix3x2fv, arginfo_glUniformMatrix3x2fv)
	ZEND_FE(glUniformMatrix2x4fv, arginfo_glUniformMatrix2x4fv)
	ZEND_FE(glUniformMatrix4x2fv, arginfo_glUniformMatrix4x2fv)
	ZEND_FE(glUniformMatrix3x4fv, arginfo_glUniformMatrix3x4fv)
	ZEND_FE(glUniformMatrix4x3fv, arginfo_glUniformMatrix4x3fv)
	ZEND_FE(glGenBuffers, arginfo_glGenBuffers)
	ZEND_FE(glBindBuffer, arginfo_glBindBuffer)
	ZEND_FE(glBufferData, arginfo_glBufferData)
	ZEND_FE(glBufferSubData, arginfo_glBufferSubData)
	ZEND_FE(glDeleteBuffers, arginfo_glDeleteBuffers)
	ZEND_FE(glGenVertexArrays, arginfo_glGenVertexArrays)
	ZEND_FE(glBindVertexArray, arginfo_glBindVertexArray)
	ZEND_FE(glDeleteVertexArrays, arginfo_glDeleteVertexArrays)
	ZEND_FE(glEnableVertexAttribArray, arginfo_glEnableVertexAttribArray)
	ZEND_FE(glDisableVertexAttribArray, arginfo_glDisableVertexAttribArray)
	ZEND_FE(glVertexAttribPointer, arginfo_glVertexAttribPointer)
	ZEND_FE(glDrawArrays, arginfo_glDrawArrays)
	ZEND_FE(glDrawElements, arginfo_glDrawElements)
	ZEND_FE(glGenTextures, arginfo_glGenTextures)
	ZEND_FE(glBindTexture, arginfo_glBindTexture)
	ZEND_FE(glActiveTexture, arginfo_glActiveTexture)
	ZEND_FE(glTexParameteri, arginfo_glTexParameteri)
	ZEND_FE(glTexParameterf, arginfo_glTexParameterf)
	ZEND_FE(glGetTexParameteriv, arginfo_glGetTexParameteriv)
	ZEND_FE(glGetTexParameterfv, arginfo_glGetTexParameterfv)
	ZEND_FE(glTexImage2D, arginfo_glTexImage2D)
	ZEND_FE(glTexSubImage2D, arginfo_glTexSubImage2D)
	ZEND_FE(glTexImage3D, arginfo_glTexImage3D)
	ZEND_FE(glTexSubImage3D, arginfo_glTexSubImage3D)
	ZEND_FE(glTexStorage2D, arginfo_glTexStorage2D)
	ZEND_FE(glTexStorage3D, arginfo_glTexStorage3D)
	ZEND_FE(glCompressedTexImage2D, arginfo_glCompressedTexImage2D)
	ZEND_FE(glCompressedTexSubImage2D, arginfo_glCompressedTexSubImage2D)
	ZEND_FE(glCompressedTexImage3D, arginfo_glCompressedTexImage3D)
	ZEND_FE(glCompressedTexSubImage3D, arginfo_glCompressedTexSubImage3D)
	ZEND_FE(glGenerateMipmap, arginfo_glGenerateMipmap)
	ZEND_FE(glDeleteTextures, arginfo_glDeleteTextures)
	ZEND_FE(glGenSamplers, arginfo_glGenSamplers)
	ZEND_FE(glDeleteSamplers, arginfo_glDeleteSamplers)
	ZEND_FE(glIsSampler, arginfo_glIsSampler)
	ZEND_FE(glBindSampler, arginfo_glBindSampler)
	ZEND_FE(glSamplerParameteri, arginfo_glSamplerParameteri)
	ZEND_FE(glSamplerParameterf, arginfo_glSamplerParameterf)
	ZEND_FE(glGetSamplerParameteriv, arginfo_glGetSamplerParameteriv)
	ZEND_FE(glGetSamplerParameterfv, arginfo_glGetSamplerParameterfv)
	ZEND_FE(glReadPixels, arginfo_glReadPixels)
	ZEND_FE(glGenFramebuffers, arginfo_glGenFramebuffers)
	ZEND_FE(glBindFramebuffer, arginfo_glBindFramebuffer)
	ZEND_FE(glFramebufferTexture2D, arginfo_glFramebufferTexture2D)
	ZEND_FE(glCheckFramebufferStatus, arginfo_glCheckFramebufferStatus)
	ZEND_FE(glDeleteFramebuffers, arginfo_glDeleteFramebuffers)
	ZEND_FE(glVertexAttribIPointer, arginfo_glVertexAttribIPointer)
	ZEND_FE(glVertexAttribDivisor, arginfo_glVertexAttribDivisor)
	ZEND_FE(glDrawArraysInstanced, arginfo_glDrawArraysInstanced)
	ZEND_FE(glDrawElementsInstanced, arginfo_glDrawElementsInstanced)
	ZEND_FE(glBindBufferBase, arginfo_glBindBufferBase)
	ZEND_FE(glBindBufferRange, arginfo_glBindBufferRange)
	ZEND_FE(glGetBufferParameteriv, arginfo_glGetBufferParameteriv)
	ZEND_FE(glCopyBufferSubData, arginfo_glCopyBufferSubData)
	ZEND_FE(glGetIntegeri_v, arginfo_glGetIntegeri_v)
	ZEND_FE(glGetUniformBlockIndex, arginfo_glGetUniformBlockIndex)
	ZEND_FE(glUniformBlockBinding, arginfo_glUniformBlockBinding)
	ZEND_FE(glGetActiveUniform, arginfo_glGetActiveUniform)
	ZEND_FE(glGetActiveAttrib, arginfo_glGetActiveAttrib)
	ZEND_FE(glGetUniformIndices, arginfo_glGetUniformIndices)
	ZEND_FE(glGetActiveUniformsiv, arginfo_glGetActiveUniformsiv)
	ZEND_FE(glGetActiveUniformBlockiv, arginfo_glGetActiveUniformBlockiv)
	ZEND_FE(glGetActiveUniformBlockName, arginfo_glGetActiveUniformBlockName)
	ZEND_FE(glUniform1ui, arginfo_glUniform1ui)
	ZEND_FE(glUniform2ui, arginfo_glUniform2ui)
	ZEND_FE(glUniform3ui, arginfo_glUniform3ui)
	ZEND_FE(glUniform4ui, arginfo_glUniform4ui)
	ZEND_FE(glUniform1uiv, arginfo_glUniform1uiv)
	ZEND_FE(glUniform2uiv, arginfo_glUniform2uiv)
	ZEND_FE(glUniform3uiv, arginfo_glUniform3uiv)
	ZEND_FE(glUniform4uiv, arginfo_glUniform4uiv)
	ZEND_FE(glGenRenderbuffers, arginfo_glGenRenderbuffers)
	ZEND_FE(glDeleteRenderbuffers, arginfo_glDeleteRenderbuffers)
	ZEND_FE(glBindRenderbuffer, arginfo_glBindRenderbuffer)
	ZEND_FE(glRenderbufferStorage, arginfo_glRenderbufferStorage)
	ZEND_FE(glRenderbufferStorageMultisample, arginfo_glRenderbufferStorageMultisample)
	ZEND_FE(glFramebufferRenderbuffer, arginfo_glFramebufferRenderbuffer)
	ZEND_FE(glFramebufferTextureLayer, arginfo_glFramebufferTextureLayer)
	ZEND_FE(glBlitFramebuffer, arginfo_glBlitFramebuffer)
	ZEND_FE(glDrawBuffers, arginfo_glDrawBuffers)
	ZEND_FE(glReadBuffer, arginfo_glReadBuffer)
	ZEND_FE(glGetRenderbufferParameteriv, arginfo_glGetRenderbufferParameteriv)
	ZEND_FE(glGetFramebufferAttachmentParameteriv, arginfo_glGetFramebufferAttachmentParameteriv)
	ZEND_FE(glGetInternalformativ, arginfo_glGetInternalformativ)
	ZEND_FE(glBlendFuncSeparate, arginfo_glBlendFuncSeparate)
	ZEND_FE(glBlendEquation, arginfo_glBlendEquation)
	ZEND_FE(glBlendEquationSeparate, arginfo_glBlendEquationSeparate)
	ZEND_FE(glBlendColor, arginfo_glBlendColor)
	ZEND_FE(glColorMask, arginfo_glColorMask)
	ZEND_FE(glStencilFunc, arginfo_glStencilFunc)
	ZEND_FE(glStencilFuncSeparate, arginfo_glStencilFuncSeparate)
	ZEND_FE(glStencilOp, arginfo_glStencilOp)
	ZEND_FE(glStencilOpSeparate, arginfo_glStencilOpSeparate)
	ZEND_FE(glStencilMask, arginfo_glStencilMask)
	ZEND_FE(glStencilMaskSeparate, arginfo_glStencilMaskSeparate)
	ZEND_FE(glDepthRange, arginfo_glDepthRange)
	ZEND_FE(glPolygonOffset, arginfo_glPolygonOffset)
	ZEND_FE(glLineWidth, arginfo_glLineWidth)
	ZEND_FE(glIsBuffer, arginfo_glIsBuffer)
	ZEND_FE(glIsTexture, arginfo_glIsTexture)
	ZEND_FE(glIsFramebuffer, arginfo_glIsFramebuffer)
	ZEND_FE(glIsRenderbuffer, arginfo_glIsRenderbuffer)
	ZEND_FE(glIsVertexArray, arginfo_glIsVertexArray)
	ZEND_FE(glIsShader, arginfo_glIsShader)
	ZEND_FE(glIsProgram, arginfo_glIsProgram)
	ZEND_FE_END
};
