/* Checked browser texture transfers and sampler objects. PHP License 3.01. */
#include "php_webgl.h"

extern SDL_Surface *zval_to_sdl_surface(zval *value);
#ifdef __EMSCRIPTEN__
extern void php_webgl_compressed_empty(GLenum target, GLint level, GLint x, GLint y, GLint z,
	GLsizei width, GLsizei height, GLsizei depth, GLenum format, int mode);
extern void php_webgl_texture_layout(GLenum target, GLint level, GLint x, GLint y, GLint z,
	GLsizei width, GLsizei height, GLsizei depth, GLenum internal, GLenum format, GLenum type,
	const void *data, int bytes, int mode);
extern void php_webgl_read_layout(GLint x, GLint y, GLsizei width, GLsizei height,
	GLenum format, GLenum type, void *data, int bytes);
#endif

static zend_bool pixel_buffer_unbound(zend_bool pack)
{
	if (!php_webgl_is_3()) { return 1; }
	GLint buffer = 0;
	glGetIntegerv(pack ? GL_PIXEL_PACK_BUFFER_BINDING : GL_PIXEL_UNPACK_BUFFER_BINDING, &buffer);
	if (buffer) {
		zend_value_error("PHP pixel transfers require no pixel buffer binding"); return 0;
	}
	return 1;
}

PHP_FUNCTION(glPixelStorei)
{
	zend_long name, value; PARSE("ll", &name, &value);
	if (name == GL_PACK_ALIGNMENT || name == GL_UNPACK_ALIGNMENT) {
		if (value != 1 && value != 2 && value != 4 && value != 8) {
			zend_value_error("pixel alignment must be 1, 2, 4 or 8"); RETURN_THROWS();
		}
	} else {
		if (!php_webgl_require_3() || !nonnegative(value, "pixel store value")) { RETURN_THROWS(); }
		switch (name) {
		case GL_PACK_ROW_LENGTH: case GL_PACK_SKIP_ROWS: case GL_PACK_SKIP_PIXELS:
		case GL_UNPACK_ROW_LENGTH: case GL_UNPACK_SKIP_ROWS: case GL_UNPACK_SKIP_PIXELS:
		case GL_UNPACK_IMAGE_HEIGHT: case GL_UNPACK_SKIP_IMAGES: break;
		default: zend_value_error("unsupported pixel store selector"); RETURN_THROWS();
		}
	}
	glPixelStorei(name, value);
}

static int pixel_width(GLenum format, GLenum type)
{
	int components;
	switch (format) {
	case GL_ALPHA: case GL_LUMINANCE: case GL_RED: case GL_RED_INTEGER: case GL_DEPTH_COMPONENT: components = 1; break;
	case GL_LUMINANCE_ALPHA: case GL_RG: case GL_RG_INTEGER: components = 2; break;
	case GL_RGB: case GL_RGB_INTEGER: components = 3; break;
	case GL_RGBA: case GL_RGBA_INTEGER: components = 4; break;
	case GL_DEPTH_STENCIL: components = 0; break;
	default: goto invalid;
	}
	switch (type) {
	case GL_UNSIGNED_BYTE: case GL_BYTE: if (components) { return components; } break;
	case GL_UNSIGNED_SHORT: case GL_SHORT: case GL_HALF_FLOAT: case GL_HALF_FLOAT_OES:
		if (components) { return components * 2; } break;
	case GL_UNSIGNED_INT: case GL_INT: case GL_FLOAT: if (components) { return components * 4; } break;
	case GL_UNSIGNED_SHORT_5_6_5: if (format == GL_RGB) { return 2; } break;
	case GL_UNSIGNED_SHORT_4_4_4_4: case GL_UNSIGNED_SHORT_5_5_5_1: if (format == GL_RGBA) { return 2; } break;
	case GL_UNSIGNED_INT_2_10_10_10_REV: if (format == GL_RGBA || format == GL_RGBA_INTEGER) { return 4; } break;
	case GL_UNSIGNED_INT_10F_11F_11F_REV: case GL_UNSIGNED_INT_5_9_9_9_REV: if (format == GL_RGB) { return 4; } break;
	case GL_UNSIGNED_INT_24_8: if (format == GL_DEPTH_STENCIL) { return 4; } break;
	case GL_FLOAT_32_UNSIGNED_INT_24_8_REV: if (format == GL_DEPTH_STENCIL) { return 8; } break;
	}
invalid:
	zend_value_error("unsupported pixel format/type layout"); return 0;
}

/* All pointer ranges fit PHP's wasm32 allocation and GLES int32 byte counts. */
static zend_bool pixel_range(uint64_t *total, uint64_t count, uint64_t stride)
{
	if (stride && count > (INT_MAX - *total) / stride) {
		zend_value_error("pixel transfer exceeds the native byte range"); return 0;
	}
	*total += count * stride; return 1;
}

static zend_bool pixel_size(zend_long width, zend_long height, zend_long depth,
	GLenum format, GLenum type, zend_bool pack, zend_bool three, size_t *bytes, zend_bool *custom)
{
	if (!nonnegative(width, "width") || !nonnegative(height, "height") || !nonnegative(depth, "depth")) { return 0; }
	int element = pixel_width(format, type); if (!element) { return 0; }
	if (type == GL_FLOAT_32_UNSIGNED_INT_24_8_REV) {
		zend_value_error("WebGL permits FLOAT_32_UNSIGNED_INT_24_8_REV only for null texture allocation"); return 0;
	}
	GLint alignment = 4, row = 0, rows = 0, pixels = 0, image = 0, images = 0;
	glGetIntegerv(pack ? GL_PACK_ALIGNMENT : GL_UNPACK_ALIGNMENT, &alignment);
	if (php_webgl_is_3()) {
		glGetIntegerv(pack ? GL_PACK_ROW_LENGTH : GL_UNPACK_ROW_LENGTH, &row);
		glGetIntegerv(pack ? GL_PACK_SKIP_ROWS : GL_UNPACK_SKIP_ROWS, &rows);
		glGetIntegerv(pack ? GL_PACK_SKIP_PIXELS : GL_UNPACK_SKIP_PIXELS, &pixels);
		if (three) {
			glGetIntegerv(GL_UNPACK_IMAGE_HEIGHT, &image);
			glGetIntegerv(GL_UNPACK_SKIP_IMAGES, &images);
		}
	}
	if ((alignment != 1 && alignment != 2 && alignment != 4 && alignment != 8)
		|| row < 0 || rows < 0 || pixels < 0 || image < 0 || images < 0) {
		zend_value_error("invalid pixel store state"); return 0;
	}
	*custom = row || rows || pixels || image || images;
	if (!width || !height || !depth) { *bytes = 0; return 1; }
	uint64_t row_width = row ? row : width, image_height = image ? image : height;
	/* WebGL forbids overlapping source rows/images for client byte arrays. */
	if ((uint64_t)pixels + width > row_width || (three && (uint64_t)rows + height > image_height)) {
		zend_value_error("pixel skip and extent exceed the declared row or image"); return 0;
	}
	uint64_t line = 0;
	if (!pixel_range(&line, row_width, element)) { return 0; }
	uint64_t stride = (line + alignment - 1) & ~(uint64_t)(alignment - 1);
	uint64_t image_stride = 0, required = 0;
	if (stride > INT_MAX || (three && !pixel_range(&image_stride, image_height, stride))) {
		if (!EG(exception)) { zend_value_error("pixel stride exceeds the native byte range"); } return 0;
	}
	if ((three && !pixel_range(&required, (uint64_t)images + depth - 1, image_stride))
		|| !pixel_range(&required, (uint64_t)rows + height - 1, stride)
		|| !pixel_range(&required, (uint64_t)pixels + width, element)) { return 0; }
	*bytes = required; return 1;
}

static const GLenum unpack_fields[] = {GL_UNPACK_ALIGNMENT, GL_UNPACK_ROW_LENGTH,
	GL_UNPACK_SKIP_ROWS, GL_UNPACK_SKIP_PIXELS, GL_UNPACK_IMAGE_HEIGHT, GL_UNPACK_SKIP_IMAGES};

static int surface_unpack(GLint *previous)
{
	int count = php_webgl_is_3() ? 6 : 1;
	for (int i = 0; i < count; i++) {
		glGetIntegerv(unpack_fields[i], &previous[i]);
		glPixelStorei(unpack_fields[i], i ? 0 : 4);
	}
	return count;
}

static void texture_upload(INTERNAL_FUNCTION_PARAMETERS, zend_bool subimage, zend_bool three)
{
	zend_long target, level, x = 0, y = 0, z = 0, internal = 0, width, height, depth = 1, border = 0, format, type;
	zval *value;
	if (three && subimage) {
		PARSE3("llllllllllz", &target, &level, &x, &y, &z, &width, &height, &depth, &format, &type, &value);
	} else if (three) {
		PARSE3("lllllllllz", &target, &level, &internal, &width, &height, &depth, &border, &format, &type, &value);
	} else if (subimage) {
		PARSE("llllllllz", &target, &level, &x, &y, &width, &height, &format, &type, &value);
	} else {
		PARSE("llllllllz", &target, &level, &internal, &width, &height, &border, &format, &type, &value);
	}
	if (border) { zend_value_error("texture border must be zero"); RETURN_THROWS(); }
	if (!nonnegative(level, "level") || !nonnegative(x, "x") || !nonnegative(y, "y") || !nonnegative(z, "z")
		|| !nonnegative(width, "width") || !nonnegative(height, "height") || !nonnegative(depth, "depth")
		|| !pixel_buffer_unbound(0)) { RETURN_THROWS(); }
	SDL_Surface *converted = NULL;
	const void *data = NULL;
	size_t bytes;
	zend_bool custom = 0;
	GLint previous[6]; int restore = 0;
	if (!three && Z_TYPE_P(value) == IS_OBJECT) {
		SDL_Surface *surface = zval_to_sdl_surface(value);
		if (!surface || surface->w != width || surface->h != height || format != GL_RGBA || type != GL_UNSIGNED_BYTE) {
			zend_value_error("surface upload requires a live SDL_Surface, matching dimensions, RGBA and UNSIGNED_BYTE"); RETURN_THROWS();
		}
		converted = SDL_ConvertSurfaceFormat(surface, SDL_PIXELFORMAT_RGBA32, 0);
		if (!converted) { zend_throw_error(NULL, "%s", SDL_GetError()); RETURN_THROWS(); }
		data = converted->pixels; restore = surface_unpack(previous);
	} else if (Z_TYPE_P(value) == IS_STRING) {
		data = Z_STRVAL_P(value);
	} else if (Z_TYPE_P(value) != IS_NULL || subimage) {
		zend_type_error(three ? "3D pixels must be packed bytes, or null for allocation"
			: "pixels must be packed bytes, SDL_Surface, or null for allocation"); RETURN_THROWS();
	}
	/* Null allocation is exempt from WebGL's source-row/image constraints. */
	if (data) {
		if (!pixel_size(width, height, depth, format, type, 0, three, &bytes, &custom)) { goto finish; }
		if (Z_TYPE_P(value) == IS_STRING && bytes > Z_STRLEN_P(value)) {
			zend_value_error("pixel data is shorter than the requested layout"); goto finish;
		}
	} else if (!pixel_width(format, type)) { goto finish; }
#ifdef __EMSCRIPTEN__
	/* The pinned SDK's sized fallback views omit row/image skip prefixes. */
	if (custom) {
		php_webgl_texture_layout(target, level, x, y, z, width, height, depth, internal, format, type,
			data, bytes, subimage | (three << 1));
		goto finish;
	}
#endif
	if (three && subimage) { glTexSubImage3D(target, level, x, y, z, width, height, depth, format, type, data); }
	else if (three) { glTexImage3D(target, level, internal, width, height, depth, 0, format, type, data); }
	else if (subimage) { glTexSubImage2D(target, level, x, y, width, height, format, type, data); }
	else { glTexImage2D(target, level, internal, width, height, 0, format, type, data); }
finish:
	for (int i = 0; i < restore; i++) { glPixelStorei(unpack_fields[i], previous[i]); }
	if (converted) { SDL_FreeSurface(converted); }
	if (EG(exception)) { RETURN_THROWS(); }
}

PHP_FUNCTION(glTexImage2D) { texture_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, 0); }
PHP_FUNCTION(glTexSubImage2D) { texture_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, 0); }
PHP_FUNCTION(glTexImage3D) { texture_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, 1); }
PHP_FUNCTION(glTexSubImage3D) { texture_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, 1); }

PHP_FUNCTION(glReadPixels)
{
	zend_long x, y, width, height, format, type; PARSE("llllll", &x, &y, &width, &height, &format, &type);
	size_t bytes;
	zend_bool custom;
	if (!pixel_buffer_unbound(1) || !pixel_size(width, height, 1, format, type, 1, 0, &bytes, &custom)) { RETURN_THROWS(); }
	zend_string *result = zend_string_alloc(bytes, 0);
	/* Prefixes, row padding and failed native reads never expose heap contents. */
	memset(ZSTR_VAL(result), 0, bytes + 1);
#ifdef __EMSCRIPTEN__
	/* PACK state is independent of the SDK fallback helper's UNPACK state. */
	php_webgl_read_layout(x, y, width, height, format, type, ZSTR_VAL(result), bytes);
#else
	glReadPixels(x, y, width, height, format, type, ZSTR_VAL(result));
#endif
	RETURN_STR(result);
}

PHP_FUNCTION(glTexStorage2D)
{
	zend_long target, levels, format, width, height; PARSE3("lllll", &target, &levels, &format, &width, &height);
	if (!nonnegative(levels, "levels") || !nonnegative(width, "width") || !nonnegative(height, "height")) { RETURN_THROWS(); }
	glTexStorage2D(target, levels, format, width, height);
}
PHP_FUNCTION(glTexStorage3D)
{
	zend_long target, levels, format, width, height, depth; PARSE3("llllll", &target, &levels, &format, &width, &height, &depth);
	if (!nonnegative(levels, "levels") || !nonnegative(width, "width") || !nonnegative(height, "height") || !nonnegative(depth, "depth")) { RETURN_THROWS(); }
	glTexStorage3D(target, levels, format, width, height, depth);
}

/* WebGL compressed formats use 2D blocks for each array/depth slice. Native
 * WebGL validates target, mip and block-offset restrictions after this check. */
static zend_bool compressed_size(GLenum format, zend_long width, zend_long height, zend_long depth, size_t *bytes)
{
	uint64_t block_width = 4, block_height = 4, block_bytes = 16;
	static const unsigned char astc[][2] = {
		{4,4}, {5,4}, {5,5}, {6,5}, {6,6}, {8,5}, {8,6}, {8,8},
		{10,5}, {10,6}, {10,8}, {10,10}, {12,10}, {12,12}
	};
	if ((format >= GL_COMPRESSED_RGBA_ASTC_4x4_KHR && format <= GL_COMPRESSED_RGBA_ASTC_12x12_KHR)
		|| (format >= GL_COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR && format <= GL_COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR)) {
		unsigned int index = (format - GL_COMPRESSED_RGBA_ASTC_4x4_KHR) & 0x1f;
		block_width = astc[index][0]; block_height = astc[index][1];
	} else {
		switch (format) {
		case GL_COMPRESSED_RGB_S3TC_DXT1_EXT: case GL_COMPRESSED_RGBA_S3TC_DXT1_EXT:
		case GL_COMPRESSED_SRGB_S3TC_DXT1_EXT: case GL_COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT:
		case GL_ETC1_RGB8_OES: case GL_COMPRESSED_R11_EAC: case GL_COMPRESSED_SIGNED_R11_EAC:
		case GL_COMPRESSED_RGB8_ETC2: case GL_COMPRESSED_SRGB8_ETC2:
		case GL_COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2: case GL_COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2:
		case GL_COMPRESSED_RED_RGTC1_EXT: case GL_COMPRESSED_SIGNED_RED_RGTC1_EXT:
			block_bytes = 8; break;
		case GL_COMPRESSED_RGBA_S3TC_DXT3_EXT: case GL_COMPRESSED_RGBA_S3TC_DXT5_EXT:
		case GL_COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT: case GL_COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT:
		case GL_COMPRESSED_RG11_EAC: case GL_COMPRESSED_SIGNED_RG11_EAC:
		case GL_COMPRESSED_RGBA8_ETC2_EAC: case GL_COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:
		case GL_COMPRESSED_RED_GREEN_RGTC2_EXT: case GL_COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT:
		case GL_COMPRESSED_RGBA_BPTC_UNORM_EXT: case GL_COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:
		case GL_COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT: case GL_COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT: break;
		case GL_COMPRESSED_RGB_PVRTC_2BPPV1_IMG: case GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG:
			block_width = 8; block_bytes = 8;
			width = width < 16 ? 16 : width; height = height < 8 ? 8 : height; break;
		case GL_COMPRESSED_RGB_PVRTC_4BPPV1_IMG: case GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG:
			block_bytes = 8; width = width < 8 ? 8 : width; height = height < 8 ? 8 : height; break;
		default: zend_value_error("unsupported compressed pixel layout"); return 0;
		}
	}
	uint64_t row = 0, slice = 0, total = 0;
	if (!pixel_range(&row, ((uint64_t)width + block_width - 1) / block_width, block_bytes)
		|| !pixel_range(&slice, ((uint64_t)height + block_height - 1) / block_height, row)
		|| !pixel_range(&total, depth, slice)) { return 0; }
	*bytes = total; return 1;
}

static zend_bool compressed_supported(GLenum format)
{
	GLint count = 0; glGetIntegerv(GL_NUM_COMPRESSED_TEXTURE_FORMATS, &count);
	if (count < 0 || count > INT_MAX / (int)sizeof(GLint)) {
		zend_throw_error(NULL, "invalid native compressed format count"); return 0;
	}
	GLint *formats = ecalloc(count ? count : 1, sizeof(*formats));
	if (count) { glGetIntegerv(GL_COMPRESSED_TEXTURE_FORMATS, formats); }
	zend_bool found = 0;
	for (GLint i = 0; i < count; i++) { if ((GLenum)formats[i] == format) { found = 1; break; } }
	efree(formats);
	if (!found) { zend_value_error("compressed format is not supported by the current WebGL context"); }
	return found;
}

static void compressed_upload(INTERNAL_FUNCTION_PARAMETERS, zend_bool subimage, zend_bool three)
{
	zend_long target, level, format, x = 0, y = 0, z = 0, width, height, depth = 1, border = 0, size;
	zend_string *data;
	if (three && subimage) {
		PARSE3("llllllllllS", &target, &level, &x, &y, &z, &width, &height, &depth, &format, &size, &data);
	} else if (three) {
		PARSE3("llllllllS", &target, &level, &format, &width, &height, &depth, &border, &size, &data);
	} else if (subimage) {
		PARSE("llllllllS", &target, &level, &x, &y, &width, &height, &format, &size, &data);
	} else {
		PARSE("lllllllS", &target, &level, &format, &width, &height, &border, &size, &data);
	}
	if (border) { zend_value_error("texture border must be zero"); RETURN_THROWS(); }
	if (!nonnegative(level, "level") || !nonnegative(x, "x") || !nonnegative(y, "y") || !nonnegative(z, "z")
		|| !nonnegative(width, "width") || !nonnegative(height, "height") || !nonnegative(depth, "depth")
		|| !nonnegative(size, "image size") || !pixel_buffer_unbound(0)) { RETURN_THROWS(); }
	size_t bytes;
	if (!compressed_size(format, width, height, depth, &bytes)) { RETURN_THROWS(); }
	if ((size_t)size != bytes || bytes > ZSTR_LEN(data)) {
		zend_value_error("compressed image size must match its block layout and fit the supplied bytes"); RETURN_THROWS();
	}
	if (!compressed_supported(format)) { RETURN_THROWS(); }
#ifdef __EMSCRIPTEN__
	if (!bytes) {
		php_webgl_compressed_empty(target, level, x, y, z, width, height, depth, format, subimage | (three << 1));
		return;
	}
#endif
	if (three && subimage) { glCompressedTexSubImage3D(target, level, x, y, z, width, height, depth, format, size, ZSTR_VAL(data)); }
	else if (three) { glCompressedTexImage3D(target, level, format, width, height, depth, 0, size, ZSTR_VAL(data)); }
	else if (subimage) { glCompressedTexSubImage2D(target, level, x, y, width, height, format, size, ZSTR_VAL(data)); }
	else { glCompressedTexImage2D(target, level, format, width, height, 0, size, ZSTR_VAL(data)); }
}
PHP_FUNCTION(glCompressedTexImage2D) { compressed_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, 0); }
PHP_FUNCTION(glCompressedTexSubImage2D) { compressed_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, 0); }
PHP_FUNCTION(glCompressedTexImage3D) { compressed_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, 1); }
PHP_FUNCTION(glCompressedTexSubImage3D) { compressed_upload(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, 1); }

PHP_FUNCTION(glTexParameteri)
{
	zend_long target, parameter, value; PARSE("lll", &target, &parameter, &value); glTexParameteri(target, parameter, value);
}
PHP_FUNCTION(glTexParameterf)
{
	zend_long target, parameter; double value; PARSE("lld", &target, &parameter, &value);
	if (!uniform_float(value)) { RETURN_THROWS(); } glTexParameterf(target, parameter, value);
}

static zend_bool texture_parameter(GLenum name, zend_bool sampler)
{
	switch (name) {
	case GL_TEXTURE_MIN_FILTER: case GL_TEXTURE_MAG_FILTER: case GL_TEXTURE_WRAP_S: case GL_TEXTURE_WRAP_T: return 1;
	case GL_TEXTURE_WRAP_R: case GL_TEXTURE_MIN_LOD: case GL_TEXTURE_MAX_LOD:
	case GL_TEXTURE_COMPARE_MODE: case GL_TEXTURE_COMPARE_FUNC: return php_webgl_require_3();
	case GL_TEXTURE_BASE_LEVEL: case GL_TEXTURE_MAX_LEVEL: case GL_TEXTURE_IMMUTABLE_FORMAT: case GL_TEXTURE_IMMUTABLE_LEVELS:
		if (!sampler) { return php_webgl_require_3(); } break;
	}
	zend_value_error("unsupported texture or sampler parameter selector"); return 0;
}

static zend_bool sampler_handle(zend_long value)
{
	if (value <= 0 || (uint64_t)value > UINT_MAX || !glIsSampler(value)) {
		zend_value_error("sampler must name a live sampler in the current context"); return 0;
	}
	return 1;
}

static void parameter_query(INTERNAL_FUNCTION_PARAMETERS, zend_bool sampler, zend_bool floating)
{
	zend_long target, parameter; PARSE("ll", &target, &parameter);
	if ((sampler && (!php_webgl_require_3() || !sampler_handle(target))) || !texture_parameter(parameter, sampler)) { RETURN_THROWS(); }
	if (floating) {
		GLfloat result = 0;
		if (sampler) { glGetSamplerParameterfv(target, parameter, &result); }
		else { glGetTexParameterfv(target, parameter, &result); }
		RETURN_DOUBLE(result);
	}
	GLint result = 0;
	if (sampler) { glGetSamplerParameteriv(target, parameter, &result); }
	else { glGetTexParameteriv(target, parameter, &result); }
	RETURN_LONG(result);
}
PHP_FUNCTION(glGetTexParameteriv) { parameter_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, 0); }
PHP_FUNCTION(glGetTexParameterfv) { parameter_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, 1); }
PHP_FUNCTION(glGetSamplerParameteriv) { parameter_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, 0); }
PHP_FUNCTION(glGetSamplerParameterfv) { parameter_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, 1); }
PHP_FUNCTION(glGenSamplers) { php_webgl_generate(INTERNAL_FUNCTION_PARAM_PASSTHRU, PHP_WEBGL_SAMPLER); }
PHP_FUNCTION(glDeleteSamplers) { php_webgl_delete(INTERNAL_FUNCTION_PARAM_PASSTHRU, PHP_WEBGL_SAMPLER); }
PHP_FUNCTION(glIsSampler)
{
	zend_long value; PARSE3("l", &value);
	RETURN_BOOL(value > 0 && (uint64_t)value <= UINT_MAX && glIsSampler(value));
}
PHP_FUNCTION(glBindSampler)
{
	zend_long unit, value; PARSE3("ll", &unit, &value);
	if (!nonnegative(unit, "unit") || (value && !sampler_handle(value))) { RETURN_THROWS(); }
	glBindSampler(unit, value);
}
PHP_FUNCTION(glSamplerParameteri)
{
	zend_long sampler, parameter, value; PARSE3("lll", &sampler, &parameter, &value);
	if (!sampler_handle(sampler) || !texture_parameter(parameter, 1)) { RETURN_THROWS(); }
	glSamplerParameteri(sampler, parameter, value);
}
PHP_FUNCTION(glSamplerParameterf)
{
	zend_long sampler, parameter; double value; PARSE3("lld", &sampler, &parameter, &value);
	if (!sampler_handle(sampler) || !texture_parameter(parameter, 1) || !uniform_float(value)) { RETURN_THROWS(); }
	glSamplerParameterf(sampler, parameter, value);
}
