/* Sized state queries and render state. PHP License 3.01. */
#include "php_webgl.h"

static int query_size(GLenum name, zend_bool *array)
{
	*array = 0;
	switch (name) {
	case GL_VIEWPORT: case GL_SCISSOR_BOX: case GL_COLOR_CLEAR_VALUE: case GL_COLOR_WRITEMASK: case GL_BLEND_COLOR:
		*array = 1; return 4;
	case GL_DEPTH_RANGE: case GL_ALIASED_LINE_WIDTH_RANGE: case GL_ALIASED_POINT_SIZE_RANGE: case GL_MAX_VIEWPORT_DIMS:
		*array = 1; return 2;
	case GL_COMPRESSED_TEXTURE_FORMATS: case GL_SHADER_BINARY_FORMATS: case GL_PROGRAM_BINARY_FORMATS: {
		GLint count = 0;
		glGetIntegerv(name == GL_COMPRESSED_TEXTURE_FORMATS ? GL_NUM_COMPRESSED_TEXTURE_FORMATS
			: name == GL_SHADER_BINARY_FORMATS ? GL_NUM_SHADER_BINARY_FORMATS : GL_NUM_PROGRAM_BINARY_FORMATS, &count);
		*array = 1; return count < 0 ? 0 : count;
	}
	case GL_CURRENT_PROGRAM: case GL_ARRAY_BUFFER_BINDING: case GL_ELEMENT_ARRAY_BUFFER_BINDING:
	case GL_VERTEX_ARRAY_BINDING: case GL_TEXTURE_BINDING_2D: case GL_ACTIVE_TEXTURE:
	case GL_FRAMEBUFFER_BINDING: case GL_READ_FRAMEBUFFER_BINDING: case GL_RENDERBUFFER_BINDING:
	case GL_MAX_TEXTURE_SIZE: case GL_MAX_VERTEX_ATTRIBS: case GL_MAX_TEXTURE_IMAGE_UNITS:
	case GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS: case GL_MAX_VERTEX_TEXTURE_IMAGE_UNITS:
	case GL_PACK_ALIGNMENT: case GL_UNPACK_ALIGNMENT: case GL_DEPTH_FUNC: case GL_CULL_FACE_MODE:
	case GL_FRONT_FACE: case GL_MAX_RENDERBUFFER_SIZE: case GL_MAX_3D_TEXTURE_SIZE: case GL_MAX_CUBE_MAP_TEXTURE_SIZE:
	case GL_MAX_ARRAY_TEXTURE_LAYERS: case GL_MAX_DRAW_BUFFERS: case GL_MAX_COLOR_ATTACHMENTS: case GL_MAX_SAMPLES:
	case GL_MAX_VERTEX_UNIFORM_COMPONENTS: case GL_MAX_FRAGMENT_UNIFORM_COMPONENTS: case GL_MAX_VARYING_COMPONENTS:
	case GL_MAX_VERTEX_UNIFORM_VECTORS: case GL_MAX_FRAGMENT_UNIFORM_VECTORS: case GL_MAX_VARYING_VECTORS:
	case GL_MAX_VERTEX_OUTPUT_COMPONENTS: case GL_MAX_FRAGMENT_INPUT_COMPONENTS:
	case GL_MAX_VERTEX_UNIFORM_BLOCKS: case GL_MAX_FRAGMENT_UNIFORM_BLOCKS: case GL_MAX_COMBINED_UNIFORM_BLOCKS:
	case GL_MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS: case GL_MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS:
	case GL_MAX_UNIFORM_BUFFER_BINDINGS: case GL_MAX_UNIFORM_BLOCK_SIZE: case GL_UNIFORM_BUFFER_OFFSET_ALIGNMENT:
	case GL_MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS: case GL_MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS:
	case GL_MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS: case GL_MAX_ELEMENTS_INDICES: case GL_MAX_ELEMENTS_VERTICES:
	case GL_UNIFORM_BUFFER_BINDING: case GL_TRANSFORM_FEEDBACK_BUFFER_BINDING: case GL_TRANSFORM_FEEDBACK_BINDING:
	case GL_COPY_READ_BUFFER_BINDING: case GL_COPY_WRITE_BUFFER_BINDING: case GL_PIXEL_PACK_BUFFER_BINDING:
	case GL_PIXEL_UNPACK_BUFFER_BINDING: case GL_TEXTURE_BINDING_3D: case GL_TEXTURE_BINDING_2D_ARRAY:
	case GL_TEXTURE_BINDING_CUBE_MAP: case GL_SAMPLER_BINDING:
	case GL_PACK_ROW_LENGTH: case GL_PACK_SKIP_PIXELS: case GL_PACK_SKIP_ROWS:
	case GL_UNPACK_ROW_LENGTH: case GL_UNPACK_SKIP_PIXELS: case GL_UNPACK_SKIP_ROWS:
	case GL_UNPACK_IMAGE_HEIGHT: case GL_UNPACK_SKIP_IMAGES:
	case GL_BLEND: case GL_CULL_FACE: case GL_DEPTH_TEST: case GL_STENCIL_TEST: case GL_SCISSOR_TEST:
	case GL_DITHER: case GL_POLYGON_OFFSET_FILL: case GL_SAMPLE_ALPHA_TO_COVERAGE: case GL_SAMPLE_COVERAGE:
	case GL_RASTERIZER_DISCARD: case GL_PRIMITIVE_RESTART_FIXED_INDEX:
	case GL_BLEND_SRC_RGB: case GL_BLEND_DST_RGB: case GL_BLEND_SRC_ALPHA: case GL_BLEND_DST_ALPHA:
	case GL_BLEND_EQUATION_RGB: case GL_BLEND_EQUATION_ALPHA:
	case GL_DEPTH_WRITEMASK: case GL_DEPTH_CLEAR_VALUE: case GL_LINE_WIDTH: case GL_POLYGON_OFFSET_FACTOR:
	case GL_POLYGON_OFFSET_UNITS: case GL_SAMPLE_COVERAGE_VALUE: case GL_SAMPLE_COVERAGE_INVERT:
	case GL_SAMPLE_BUFFERS: case GL_SAMPLES: case GL_SUBPIXEL_BITS:
	case GL_RED_BITS: case GL_GREEN_BITS: case GL_BLUE_BITS: case GL_ALPHA_BITS: case GL_DEPTH_BITS: case GL_STENCIL_BITS:
	case GL_STENCIL_FUNC: case GL_STENCIL_REF: case GL_STENCIL_VALUE_MASK: case GL_STENCIL_WRITEMASK:
	case GL_STENCIL_FAIL: case GL_STENCIL_PASS_DEPTH_FAIL: case GL_STENCIL_PASS_DEPTH_PASS: case GL_STENCIL_CLEAR_VALUE:
	case GL_STENCIL_BACK_FUNC: case GL_STENCIL_BACK_REF: case GL_STENCIL_BACK_VALUE_MASK: case GL_STENCIL_BACK_WRITEMASK:
	case GL_STENCIL_BACK_FAIL: case GL_STENCIL_BACK_PASS_DEPTH_FAIL: case GL_STENCIL_BACK_PASS_DEPTH_PASS:
	case GL_IMPLEMENTATION_COLOR_READ_TYPE: case GL_IMPLEMENTATION_COLOR_READ_FORMAT: case GL_READ_BUFFER:
	case GL_MAJOR_VERSION: case GL_MINOR_VERSION: case GL_NUM_EXTENSIONS: case GL_NUM_COMPRESSED_TEXTURE_FORMATS:
	case GL_NUM_SHADER_BINARY_FORMATS: case GL_NUM_PROGRAM_BINARY_FORMATS: case GL_SHADER_COMPILER:
	case GL_TRANSFORM_FEEDBACK_ACTIVE: case GL_TRANSFORM_FEEDBACK_PAUSED: return 1;
	default:
		if (name >= GL_DRAW_BUFFER0 && name <= GL_DRAW_BUFFER15) { return 1; }
		zend_value_error("unsupported state query selector"); return -1;
	}
}

void php_webgl_state_query(INTERNAL_FUNCTION_PARAMETERS, char kind)
{
	zend_long name; PARSE("l", &name);
	zend_bool array;
	int count = query_size(name, &array);
	if (count < 0) { RETURN_THROWS(); }
	/* Each GL output representation is at most sizeof(GLint). */
	void *values = ecalloc(count ? count : 1, sizeof(GLint));
	if (kind == 'b') { glGetBooleanv(name, values); }
	else if (kind == 'f') { glGetFloatv(name, values); }
	else { glGetIntegerv(name, values); }
	if (array) { array_init(return_value); }
	for (int i = 0; i < count; i++) {
		zval value;
		if (kind == 'b') { ZVAL_BOOL(&value, ((GLboolean *)values)[i]); }
		else if (kind == 'f') { ZVAL_DOUBLE(&value, ((GLfloat *)values)[i]); }
		else { ZVAL_LONG(&value, ((GLint *)values)[i]); }
		if (array) { add_next_index_zval(return_value, &value); }
		else { ZVAL_COPY_VALUE(return_value, &value); }
	}
	efree(values);
}
PHP_FUNCTION(glGetBooleanv) { php_webgl_state_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 'b'); }
PHP_FUNCTION(glGetFloatv) { php_webgl_state_query(INTERNAL_FUNCTION_PARAM_PASSTHRU, 'f'); }

PHP_FUNCTION(glGetStringi)
{
	zend_long name, index; PARSE3("ll", &name, &index);
	if (!nonnegative(index, "index")) { RETURN_THROWS(); }
	const GLubyte *value = glGetStringi(name, index);
	if (!value) { RETURN_NULL(); } RETURN_STRING((const char *)value);
}

PHP_FUNCTION(glBlendFuncSeparate)
{
	zend_long a, b, c, d; PARSE("llll", &a, &b, &c, &d); glBlendFuncSeparate(a, b, c, d);
}
PHP_FUNCTION(glBlendEquation)
{
	zend_long mode; PARSE("l", &mode); glBlendEquation(mode);
}
PHP_FUNCTION(glBlendEquationSeparate)
{
	zend_long rgb, alpha; PARSE("ll", &rgb, &alpha); glBlendEquationSeparate(rgb, alpha);
}
PHP_FUNCTION(glBlendColor)
{
	double r, g, b, a; PARSE("dddd", &r, &g, &b, &a);
	if (!uniform_float(r) || !uniform_float(g) || !uniform_float(b) || !uniform_float(a)) { RETURN_THROWS(); }
	glBlendColor(r, g, b, a);
}
PHP_FUNCTION(glColorMask)
{
	zend_bool r, g, b, a; PARSE("bbbb", &r, &g, &b, &a); glColorMask(r, g, b, a);
}
PHP_FUNCTION(glStencilFunc)
{
	zend_long function, reference, mask; PARSE("lll", &function, &reference, &mask); glStencilFunc(function, reference, mask);
}
PHP_FUNCTION(glStencilFuncSeparate)
{
	zend_long face, function, reference, mask; PARSE("llll", &face, &function, &reference, &mask); glStencilFuncSeparate(face, function, reference, mask);
}
PHP_FUNCTION(glStencilOp)
{
	zend_long fail, zfail, zpass; PARSE("lll", &fail, &zfail, &zpass); glStencilOp(fail, zfail, zpass);
}
PHP_FUNCTION(glStencilOpSeparate)
{
	zend_long face, fail, zfail, zpass; PARSE("llll", &face, &fail, &zfail, &zpass); glStencilOpSeparate(face, fail, zfail, zpass);
}
PHP_FUNCTION(glStencilMask)
{
	zend_long mask; PARSE("l", &mask); glStencilMask(mask);
}
PHP_FUNCTION(glStencilMaskSeparate)
{
	zend_long face, mask; PARSE("ll", &face, &mask); glStencilMaskSeparate(face, mask);
}
PHP_FUNCTION(glDepthRange)
{
	double near, far; PARSE("dd", &near, &far);
	if (!uniform_float(near) || !uniform_float(far)) { RETURN_THROWS(); }
	glDepthRangef(near, far);
}
PHP_FUNCTION(glPolygonOffset)
{
	double factor, units; PARSE("dd", &factor, &units);
	if (!uniform_float(factor) || !uniform_float(units)) { RETURN_THROWS(); }
	glPolygonOffset(factor, units);
}
PHP_FUNCTION(glLineWidth)
{
	double width; PARSE("d", &width);
	if (!uniform_float(width)) { RETURN_THROWS(); }
	glLineWidth(width);
}

#define OBJECT_EXISTS(name) PHP_FUNCTION(name) \
{ zend_long object; PARSE("l", &object); RETURN_BOOL(name(object)); }
OBJECT_EXISTS(glIsBuffer)
OBJECT_EXISTS(glIsTexture)
OBJECT_EXISTS(glIsFramebuffer)
OBJECT_EXISTS(glIsRenderbuffer)
PHP_FUNCTION(glIsVertexArray)
{ zend_long object; PARSE3("l", &object); RETURN_BOOL(glIsVertexArray(object)); }
OBJECT_EXISTS(glIsShader)
OBJECT_EXISTS(glIsProgram)

void php_webgl_extra_constants(int module_number)
{
#define GL_CONSTANT(name) REGISTER_LONG_CONSTANT(#name, (zend_long)name, CONST_CS | CONST_PERSISTENT)
#include "php_webgl_constants.h"
#undef GL_CONSTANT
	REGISTER_STRING_CONSTANT("GL_TIMEOUT_IGNORED", "18446744073709551615", CONST_CS | CONST_PERSISTENT);
}
