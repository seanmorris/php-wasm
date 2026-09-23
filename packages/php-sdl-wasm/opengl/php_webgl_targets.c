/* WebGL2 render targets. PHP License 3.01. */
#include "php_webgl.h"

PHP_FUNCTION(glGenRenderbuffers)
{
	php_webgl_generate(INTERNAL_FUNCTION_PARAM_PASSTHRU, PHP_WEBGL_RENDERBUFFER);
}

PHP_FUNCTION(glDeleteRenderbuffers)
{
	php_webgl_delete(INTERNAL_FUNCTION_PARAM_PASSTHRU, PHP_WEBGL_RENDERBUFFER);
}

PHP_FUNCTION(glBindRenderbuffer)
{
	zend_long target, buffer; PARSE3("ll", &target, &buffer);
	glBindRenderbuffer(target, buffer);
}

static void renderbuffer_storage(INTERNAL_FUNCTION_PARAMETERS, zend_bool multisample)
{
	zend_long target, samples = 0, format, width, height;
	if (multisample) { PARSE3("lllll", &target, &samples, &format, &width, &height); }
	else { PARSE3("llll", &target, &format, &width, &height); }
	if (!nonnegative(width, "width") || !nonnegative(height, "height") || !nonnegative(samples, "samples")) { RETURN_THROWS(); }
	GLint max_size = 0, max_samples = 0;
	glGetIntegerv(GL_MAX_RENDERBUFFER_SIZE, &max_size); glGetIntegerv(GL_MAX_SAMPLES, &max_samples);
	if (width > max_size || height > max_size || samples > max_samples) {
		zend_value_error("renderbuffer dimensions or sample count exceed context limits"); RETURN_THROWS();
	}
	if (multisample) { glRenderbufferStorageMultisample(target, samples, format, width, height); }
	else { glRenderbufferStorage(target, format, width, height); }
}
PHP_FUNCTION(glRenderbufferStorage) { renderbuffer_storage(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0); }
PHP_FUNCTION(glRenderbufferStorageMultisample) { renderbuffer_storage(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1); }

PHP_FUNCTION(glFramebufferRenderbuffer)
{
	zend_long target, attachment, renderbuffer_target, buffer;
	PARSE3("llll", &target, &attachment, &renderbuffer_target, &buffer);
	glFramebufferRenderbuffer(target, attachment, renderbuffer_target, buffer);
}

PHP_FUNCTION(glFramebufferTextureLayer)
{
	zend_long target, attachment, texture, level, layer;
	PARSE3("lllll", &target, &attachment, &texture, &level, &layer);
	if (!nonnegative(level, "level") || !nonnegative(layer, "layer")) { RETURN_THROWS(); }
	glFramebufferTextureLayer(target, attachment, texture, level, layer);
}

PHP_FUNCTION(glBlitFramebuffer)
{
	zend_long a, b, c, d, e, f, g, h, mask, filter;
	PARSE3("llllllllll", &a, &b, &c, &d, &e, &f, &g, &h, &mask, &filter);
	if (mask & ~(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT)
		|| (filter != GL_NEAREST && filter != GL_LINEAR)) {
		zend_value_error("invalid framebuffer blit mask or filter"); RETURN_THROWS();
	}
	if ((mask & (GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT)) && filter != GL_NEAREST) {
		zend_value_error("depth/stencil blits require NEAREST filtering"); RETURN_THROWS();
	}
	glBlitFramebuffer(a, b, c, d, e, f, g, h, mask, filter);
}

PHP_FUNCTION(glDrawBuffers)
{
	zend_long count; zval *values, *entry; PARSE3("la", &count, &values);
	GLint limit = 0; glGetIntegerv(GL_MAX_DRAW_BUFFERS, &limit);
	if (count < 0 || count > limit || (uint64_t)count != zend_hash_num_elements(Z_ARRVAL_P(values))) {
		zend_value_error("draw-buffer count must match the array and fit MAX_DRAW_BUFFERS"); RETURN_THROWS();
	}
	GLenum *buffers = safe_emalloc(count, sizeof(*buffers), 0); size_t index = 0;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) {
		ZVAL_DEREF(entry);
		if (Z_TYPE_P(entry) != IS_LONG || Z_LVAL_P(entry) < 0 || (uint64_t)Z_LVAL_P(entry) > UINT32_MAX) {
			efree(buffers); zend_type_error("draw buffers must be integer enums"); RETURN_THROWS();
		}
		buffers[index++] = Z_LVAL_P(entry);
	} ZEND_HASH_FOREACH_END();
	glDrawBuffers(count, buffers); efree(buffers);
}

PHP_FUNCTION(glReadBuffer)
{
	zend_long source; PARSE3("l", &source); glReadBuffer(source);
}

PHP_FUNCTION(glGetRenderbufferParameteriv)
{
	zend_long target, parameter; PARSE3("ll", &target, &parameter);
	switch (parameter) {
	case GL_RENDERBUFFER_WIDTH: case GL_RENDERBUFFER_HEIGHT: case GL_RENDERBUFFER_INTERNAL_FORMAT:
	case GL_RENDERBUFFER_RED_SIZE: case GL_RENDERBUFFER_GREEN_SIZE: case GL_RENDERBUFFER_BLUE_SIZE:
	case GL_RENDERBUFFER_ALPHA_SIZE: case GL_RENDERBUFFER_DEPTH_SIZE: case GL_RENDERBUFFER_STENCIL_SIZE:
	case GL_RENDERBUFFER_SAMPLES: break;
	default: zend_value_error("unsupported renderbuffer query"); RETURN_THROWS();
	}
	GLint value = 0; glGetRenderbufferParameteriv(target, parameter, &value); RETURN_LONG(value);
}

PHP_FUNCTION(glGetFramebufferAttachmentParameteriv)
{
	zend_long target, attachment, parameter; PARSE3("lll", &target, &attachment, &parameter);
	switch (parameter) {
	case GL_FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: case GL_FRAMEBUFFER_ATTACHMENT_OBJECT_NAME:
	case GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: case GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE:
	case GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER: case GL_FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING:
	case GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE: case GL_FRAMEBUFFER_ATTACHMENT_RED_SIZE:
	case GL_FRAMEBUFFER_ATTACHMENT_GREEN_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_BLUE_SIZE:
	case GL_FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE: case GL_FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE:
	case GL_FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE: break;
	default: zend_value_error("unsupported framebuffer attachment query"); RETURN_THROWS();
	}
	GLint value = 0; glGetFramebufferAttachmentParameteriv(target, attachment, parameter, &value); RETURN_LONG(value);
}

PHP_FUNCTION(glGetInternalformativ)
{
	zend_long target, format, parameter; PARSE3("lll", &target, &format, &parameter);
	if (target != GL_RENDERBUFFER || (parameter != GL_SAMPLES && parameter != GL_NUM_SAMPLE_COUNTS)) {
		zend_value_error("internal-format queries require RENDERBUFFER and SAMPLES or NUM_SAMPLE_COUNTS"); RETURN_THROWS();
	}
	/* Emscripten forwards SAMPLES but not NUM_SAMPLE_COUNTS. There can be at
	 * most MAX_SAMPLES+1 distinct counts, including zero. Find the sentinel. */
	GLint limit = 0; glGetIntegerv(GL_MAX_SAMPLES, &limit);
	if (limit < 0 || limit == INT_MAX) { zend_throw_error(NULL, "invalid native sample limit"); RETURN_THROWS(); }
	limit++;
	GLint *samples = safe_emalloc(limit, sizeof(*samples), 0);
	for (GLint i = 0; i < limit; i++) { samples[i] = -1; }
	glGetInternalformativ(target, format, GL_SAMPLES, limit, samples);
	GLint count = 0;
	while (count < limit && samples[count] >= 0) { count++; }
	if (parameter == GL_NUM_SAMPLE_COUNTS) { efree(samples); RETURN_LONG(count); }
	array_init(return_value);
	for (GLint i = 0; i < count; i++) { add_next_index_long(return_value, samples[i]); }
	efree(samples);
}
