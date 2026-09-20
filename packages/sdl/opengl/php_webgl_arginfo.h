/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: c8d6f69fb0f425b6d62978b72376b17365dd47f2 */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetString, 0, 1, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetError, 0, 0, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGetIntegerv, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_LONG, 0)
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

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform1i, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniform1f, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
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

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glUniformMatrix4fv, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, location, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, transpose, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, values, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

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

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glGenerateMipmap, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, target, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_glDeleteTextures, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, textures, IS_ARRAY, 0)
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


ZEND_FUNCTION(glGetString);
ZEND_FUNCTION(glGetError);
ZEND_FUNCTION(glGetIntegerv);
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
ZEND_FUNCTION(glUniform1i);
ZEND_FUNCTION(glUniform1f);
ZEND_FUNCTION(glUniform3f);
ZEND_FUNCTION(glUniform4f);
ZEND_FUNCTION(glUniformMatrix4fv);
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
ZEND_FUNCTION(glTexImage2D);
ZEND_FUNCTION(glTexSubImage2D);
ZEND_FUNCTION(glGenerateMipmap);
ZEND_FUNCTION(glDeleteTextures);
ZEND_FUNCTION(glReadPixels);
ZEND_FUNCTION(glGenFramebuffers);
ZEND_FUNCTION(glBindFramebuffer);
ZEND_FUNCTION(glFramebufferTexture2D);
ZEND_FUNCTION(glCheckFramebufferStatus);
ZEND_FUNCTION(glDeleteFramebuffers);


static const zend_function_entry ext_functions[] = {
	ZEND_FE(glGetString, arginfo_glGetString)
	ZEND_FE(glGetError, arginfo_glGetError)
	ZEND_FE(glGetIntegerv, arginfo_glGetIntegerv)
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
	ZEND_FE(glUniform1i, arginfo_glUniform1i)
	ZEND_FE(glUniform1f, arginfo_glUniform1f)
	ZEND_FE(glUniform3f, arginfo_glUniform3f)
	ZEND_FE(glUniform4f, arginfo_glUniform4f)
	ZEND_FE(glUniformMatrix4fv, arginfo_glUniformMatrix4fv)
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
	ZEND_FE(glTexImage2D, arginfo_glTexImage2D)
	ZEND_FE(glTexSubImage2D, arginfo_glTexSubImage2D)
	ZEND_FE(glGenerateMipmap, arginfo_glGenerateMipmap)
	ZEND_FE(glDeleteTextures, arginfo_glDeleteTextures)
	ZEND_FE(glReadPixels, arginfo_glReadPixels)
	ZEND_FE(glGenFramebuffers, arginfo_glGenFramebuffers)
	ZEND_FE(glBindFramebuffer, arginfo_glBindFramebuffer)
	ZEND_FE(glFramebufferTexture2D, arginfo_glFramebufferTexture2D)
	ZEND_FE(glCheckFramebufferStatus, arginfo_glCheckFramebufferStatus)
	ZEND_FE(glDeleteFramebuffers, arginfo_glDeleteFramebuffers)
	ZEND_FE_END
};
