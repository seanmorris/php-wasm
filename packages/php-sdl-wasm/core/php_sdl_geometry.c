/* Checked SDL triangle and primitive batches. PHP License 3.01. */
#include "php_sdl_extra.h"
#include "php_sdl_geometry_arginfo.h"
#include "rect.h"
#include <limits.h>
#include <math.h>

static zend_bool geometry_float(zval *value, float *result)
{
	ZVAL_DEREF(value);
	if (Z_TYPE_P(value) != IS_LONG && Z_TYPE_P(value) != IS_DOUBLE) {
		zend_type_error("coordinates must be numbers"); return 0;
	}
	double number = zval_get_double(value);
	if (!isfinite(number) || !isfinite((float)number)) {
		zend_value_error("coordinates must fit finite float32 values"); return 0;
	}
	*result = number; return 1;
}

static zend_bool geometry_count(zend_long count)
{
	if (count < 0 || count > INT_MAX) { zend_value_error("counts and strides must fit nonnegative int32"); return 0; }
	return 1;
}

static zend_bool geometry_capacity(size_t vertices, size_t indices)
{
	/* GLES2 expands indices into SDL_Vertex entries with wasm32 size arithmetic. */
	if (vertices > INT_MAX / sizeof(SDL_Vertex) || indices > INT_MAX / sizeof(SDL_Vertex)) {
		zend_value_error("geometry counts exceed the native vertex buffer range"); return 0;
	}
	return 1;
}

PHP_FUNCTION(SDL_RenderGeometry)
{
	zval *renderer_value, *texture_value, *vertices, *indices = NULL;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zza|a!", &renderer_value, &texture_value, &vertices, &indices) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(renderer_value);
	if (!renderer) { RETURN_THROWS(); }
	SDL_Texture *texture = NULL;
	if (Z_TYPE_P(texture_value) != IS_NULL && !(texture = php_sdl_texture(texture_value))) { RETURN_THROWS(); }
	size_t count = zend_hash_num_elements(Z_ARRVAL_P(vertices));
	size_t index_count = indices ? zend_hash_num_elements(Z_ARRVAL_P(indices)) : 0;
	if (!geometry_capacity(count, index_count)) { RETURN_THROWS(); }
	if (count > INT_MAX || index_count > INT_MAX || (indices ? index_count : count) % 3) {
		zend_value_error("geometry must contain complete triangles and fit native counts"); RETURN_THROWS();
	}
	SDL_Vertex *native = safe_emalloc(count, sizeof(*native), 0);
	zval *entry; size_t position = 0;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(vertices), entry) {
		ZVAL_DEREF(entry);
		if (Z_TYPE_P(entry) != IS_ARRAY || zend_hash_num_elements(Z_ARRVAL_P(entry)) != 8) {
			zend_type_error("vertices must be tuples [x,y,r,g,b,a,u,v]"); goto fail_vertices;
		}
		zval *parts[8];
		for (size_t part = 0; part < 8; part++) {
			parts[part] = zend_hash_index_find(Z_ARRVAL_P(entry), part);
			if (!parts[part]) { zend_value_error("vertex tuples require consecutive numeric keys 0..7"); goto fail_vertices; }
			ZVAL_DEREF(parts[part]);
		}
		SDL_Vertex *vertex = native + position++;
		if (!geometry_float(parts[0], &vertex->position.x) || !geometry_float(parts[1], &vertex->position.y)
			|| !geometry_float(parts[6], &vertex->tex_coord.x) || !geometry_float(parts[7], &vertex->tex_coord.y)) { goto fail_vertices; }
		Uint8 *colors[] = {&vertex->color.r, &vertex->color.g, &vertex->color.b, &vertex->color.a};
		for (size_t part = 0; part < 4; part++) {
			zval *value = parts[part + 2];
			if (Z_TYPE_P(value) != IS_LONG || Z_LVAL_P(value) < 0 || Z_LVAL_P(value) > 255) {
				zend_value_error("vertex colors must be integers between 0 and 255"); goto fail_vertices;
			}
			*colors[part] = Z_LVAL_P(value);
		}
	} ZEND_HASH_FOREACH_END();
	int *native_indices = indices ? safe_emalloc(index_count, sizeof(*native_indices), 0) : NULL;
	position = 0;
	if (indices) {
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(indices), entry) {
			ZVAL_DEREF(entry);
			if (Z_TYPE_P(entry) != IS_LONG || Z_LVAL_P(entry) < 0 || (uint64_t)Z_LVAL_P(entry) >= count) {
				efree(native_indices); zend_value_error("triangle indices must address a vertex"); goto fail_vertices;
			}
			native_indices[position++] = Z_LVAL_P(entry);
		} ZEND_HASH_FOREACH_END();
	}
	if (!count || (indices && !index_count)) { RETVAL_LONG(0); }
	else { RETVAL_LONG(SDL_RenderGeometry(renderer, texture, native, count, native_indices, index_count)); }
	if (native_indices) { efree(native_indices); }
	efree(native); return;
fail_vertices:
	efree(native); RETURN_THROWS();
}

static zend_bool geometry_bytes(zend_string *bytes, zend_long count, zend_long stride, size_t width)
{
	if (!geometry_count(count) || !geometry_count(stride)) { return 0; }
	uint64_t required = count ? (uint64_t)(count - 1) * stride + width : 0;
	if (required > INT_MAX) { zend_value_error("geometry offsets must fit native int32 arithmetic"); return 0; }
	if (required > ZSTR_LEN(bytes)) { zend_value_error("geometry buffer is shorter than count/stride requires"); return 0; }
	return 1;
}

static zend_bool geometry_coordinates(zend_string *bytes, zend_long count, zend_long stride)
{
	if (!geometry_bytes(bytes, count, stride, 2 * sizeof(float))) { return 0; }
	if (stride % sizeof(float)) { zend_value_error("coordinate strides must align to float32"); return 0; }
	for (zend_long index = 0; index < count; index++) {
		float coordinates[2];
		memcpy(coordinates, ZSTR_VAL(bytes) + (size_t)index * stride, sizeof(coordinates));
		if (!isfinite(coordinates[0]) || !isfinite(coordinates[1])) {
			zend_value_error("packed coordinates must be finite float32"); return 0;
		}
	}
	return 1;
}

PHP_FUNCTION(SDL_RenderGeometryRaw)
{
	zval *renderer_value, *texture_value;
	zend_string *xy, *colors, *uv, *indices = NULL;
	zend_long xy_stride, color_stride, uv_stride, count, index_count = 0, index_size = 4;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zzSlSlS!ll|S!ll", &renderer_value, &texture_value,
		&xy, &xy_stride, &colors, &color_stride, &uv, &uv_stride, &count, &indices, &index_count, &index_size) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(renderer_value);
	if (!renderer) { RETURN_THROWS(); }
	SDL_Texture *texture = NULL;
	if (Z_TYPE_P(texture_value) != IS_NULL && !(texture = php_sdl_texture(texture_value))) { RETURN_THROWS(); }
	if (!geometry_count(count) || !geometry_count(index_count) || !geometry_count(uv_stride)) { RETURN_THROWS(); }
	if (!geometry_capacity(count, index_count)) { RETURN_THROWS(); }
	if ((!indices && index_count) || (indices ? index_count : count) % 3 || (index_size != 1 && index_size != 2 && index_size != 4)) {
		zend_value_error("raw geometry requires complete triangles and 1/2/4-byte indices"); RETURN_THROWS();
	}
	if (texture && !uv) { zend_value_error("textured geometry requires UV coordinates"); RETURN_THROWS(); }
	if (!geometry_coordinates(xy, count, xy_stride) || !geometry_bytes(colors, count, color_stride, sizeof(SDL_Color))
		|| (uv && !geometry_coordinates(uv, count, uv_stride))) { RETURN_THROWS(); }
	if (indices) {
		if ((uint64_t)index_count * index_size > ZSTR_LEN(indices)) { zend_value_error("index buffer is too short"); RETURN_THROWS(); }
		for (zend_long index = 0; index < index_count; index++) {
			Uint32 value = 0;
			const char *entry = ZSTR_VAL(indices) + (size_t)index * index_size;
			if (index_size == 1) { value = (unsigned char)*entry; }
			else if (index_size == 2) { Uint16 number; memcpy(&number, entry, 2); value = number; }
			else { memcpy(&value, entry, 4); }
			if (value >= (uint64_t)count) { zend_value_error("triangle index exceeds vertex count"); RETURN_THROWS(); }
		}
	}
	if (!count || (indices && !index_count)) { RETURN_LONG(0); }
	RETURN_LONG(SDL_RenderGeometryRaw(renderer, texture,
		(const float *)ZSTR_VAL(xy), xy_stride, (const SDL_Color *)ZSTR_VAL(colors), color_stride,
		uv ? (const float *)ZSTR_VAL(uv) : NULL, uv_stride, count,
		indices ? ZSTR_VAL(indices) : NULL, index_count, index_size));
}

/* Read value-object components without mutating properties or coercing strings. */
static zend_bool primitive_value(zval *object, zend_class_entry *ce, const char *name, void *destination, zend_bool floating)
{
	zval temporary;
	ZVAL_UNDEF(&temporary);
	zval *value = zend_read_property(ce, Z_OBJ_P(object), name, 1, 0, &temporary);
	if (EG(exception)) { zval_ptr_dtor(&temporary); return 0; }
	ZVAL_DEREF(value);
	if (floating) {
		zend_bool valid = geometry_float(value, destination);
		zval_ptr_dtor(&temporary); return valid;
	}
	if (Z_TYPE_P(value) != IS_LONG || Z_LVAL_P(value) < INT_MIN || Z_LVAL_P(value) > INT_MAX) {
		zval_ptr_dtor(&temporary); zend_value_error("integer primitive coordinates must fit int32"); return 0;
	}
	*(int *)destination = Z_LVAL_P(value); zval_ptr_dtor(&temporary); return 1;
}

static void primitive_batch(INTERNAL_FUNCTION_PARAMETERS, zend_bool floating, int kind)
{
	zval *renderer_value, *values, *entry;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "za", &renderer_value, &values) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(renderer_value);
	if (!renderer) { RETURN_THROWS(); }
	size_t count = zend_hash_num_elements(Z_ARRVAL_P(values));
	if (count > INT_MAX) { zend_value_error("primitive count exceeds int32"); RETURN_THROWS(); }
	zend_bool rectangle = kind >= 2;
	zend_class_entry *ce = rectangle
		? (floating ? get_php_sdl_frect_ce() : get_php_sdl_rect_ce())
		: (floating ? get_php_sdl_fpoint_ce() : get_php_sdl_point_ce());
	/* SDL integer and float primitive components are all 32-bit on this target. */
	size_t width = rectangle ? sizeof(SDL_Rect) : sizeof(SDL_Point);
	char *native = safe_emalloc(count, width, 0); size_t index = 0;
	const char *names[] = {"x", "y", "w", "h"};
	/* Getters can mutate the caller's array or references to its objects. */
	HashTable *snapshot = Z_ARRVAL_P(values);
	GC_TRY_ADDREF(snapshot);
	zval object; ZVAL_UNDEF(&object);
	ZEND_HASH_FOREACH_VAL(snapshot, entry) {
		ZVAL_DEREF(entry);
		if (Z_TYPE_P(entry) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(entry), ce)) {
			zend_type_error("primitive arrays require %s objects", ZSTR_VAL(ce->name)); goto fail_primitives;
		}
		ZVAL_COPY(&object, entry);
		for (size_t component = 0; component < (rectangle ? 4 : 2); component++) {
			if (!primitive_value(&object, ce, names[component], native + index * width + component * 4, floating)) { goto fail_primitives; }
		}
		zval_ptr_dtor(&object); ZVAL_UNDEF(&object);
		if (EG(exception)) { goto fail_primitives; }
		index++;
	} ZEND_HASH_FOREACH_END();
	zend_array_release(snapshot); snapshot = NULL;
	if (EG(exception)) { goto fail_primitives; }
	/* Reading subclass properties can invoke PHP and destroy the resource. */
	renderer = php_sdl_renderer(renderer_value);
	if (!renderer) { goto fail_primitives; }
	int result = 0;
	if (count) {
		if (floating) {
			switch (kind) {
			case 0: result = SDL_RenderDrawPointsF(renderer, (SDL_FPoint *)native, count); break;
			case 1: result = SDL_RenderDrawLinesF(renderer, (SDL_FPoint *)native, count); break;
			case 2: result = SDL_RenderDrawRectsF(renderer, (SDL_FRect *)native, count); break;
			case 3: result = SDL_RenderFillRectsF(renderer, (SDL_FRect *)native, count); break;
			}
		} else {
			switch (kind) {
			case 0: result = SDL_RenderDrawPoints(renderer, (SDL_Point *)native, count); break;
			case 1: result = SDL_RenderDrawLines(renderer, (SDL_Point *)native, count); break;
			case 2: result = SDL_RenderDrawRects(renderer, (SDL_Rect *)native, count); break;
			case 3: result = SDL_RenderFillRects(renderer, (SDL_Rect *)native, count); break;
			}
		}
	}
	efree(native); RETURN_LONG(result);
fail_primitives:
	zval_ptr_dtor(&object);
	if (snapshot) { zend_array_release(snapshot); }
	efree(native); RETURN_THROWS();
}

#define PRIMITIVE_BATCH(name, kind) \
PHP_FUNCTION(name) { primitive_batch(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0, kind); } \
PHP_FUNCTION(name##F) { primitive_batch(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1, kind); }
PRIMITIVE_BATCH(SDL_RenderDrawPoints, 0)
PRIMITIVE_BATCH(SDL_RenderDrawLines, 1)
PRIMITIVE_BATCH(SDL_RenderDrawRects, 2)
PRIMITIVE_BATCH(SDL_RenderFillRects, 3)

static void renderer_info(SDL_RendererInfo *info, zval *output)
{
	if (info->num_texture_formats > SDL_arraysize(info->texture_formats)) {
		zend_throw_error(NULL, "invalid native renderer format count"); return;
	}
	zval result, formats;
	array_init(&result); array_init(&formats);
	for (Uint32 i = 0; i < info->num_texture_formats; i++) { add_next_index_long(&formats, info->texture_formats[i]); }
	if (info->name) { add_assoc_string(&result, "name", (char *)info->name); }
	else { add_assoc_null(&result, "name"); }
	add_assoc_long(&result, "flags", info->flags);
	add_assoc_long(&result, "num_texture_formats", info->num_texture_formats);
	add_assoc_zval(&result, "texture_formats", &formats);
	add_assoc_long(&result, "max_texture_width", info->max_texture_width);
	add_assoc_long(&result, "max_texture_height", info->max_texture_height);
	ZEND_TRY_ASSIGN_REF_COPY(output, &result); zval_ptr_dtor(&result);
}

PHP_FUNCTION(SDL_GetNumRenderDrivers)
{
	ZEND_PARSE_PARAMETERS_NONE(); RETURN_LONG(SDL_GetNumRenderDrivers());
}
PHP_FUNCTION(SDL_GetRenderDriverInfo)
{
	zend_long index; zval *output;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "lz", &index, &output) == FAILURE) { RETURN_THROWS(); }
	if (!geometry_count(index)) { RETURN_THROWS(); }
	SDL_RendererInfo info; int result = SDL_GetRenderDriverInfo(index, &info);
	if (result == 0) { renderer_info(&info, output); }
	if (EG(exception)) { RETURN_THROWS(); } RETURN_LONG(result);
}
PHP_FUNCTION(SDL_GetRendererInfo)
{
	zval *value, *output;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zz", &value, &output) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	SDL_RendererInfo info; int result = SDL_GetRendererInfo(renderer, &info);
	if (result == 0) { renderer_info(&info, output); }
	if (EG(exception)) { RETURN_THROWS(); } RETURN_LONG(result);
}

#define RENDER_BOOL(name) PHP_FUNCTION(name) \
{ zval *value; if (zend_parse_parameters(ZEND_NUM_ARGS(), "z", &value) == FAILURE) { RETURN_THROWS(); } \
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); } RETURN_BOOL(name(renderer)); }
RENDER_BOOL(SDL_RenderTargetSupported)
RENDER_BOOL(SDL_RenderIsClipEnabled)
RENDER_BOOL(SDL_RenderGetIntegerScale)

PHP_FUNCTION(SDL_GetRenderDrawColor)
{
	zval *value, *r, *g, *b, *a;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zzzzz", &value, &r, &g, &b, &a) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	Uint8 red = 0, green = 0, blue = 0, alpha = 0;
	int result = SDL_GetRenderDrawColor(renderer, &red, &green, &blue, &alpha);
	if (result == 0) {
		ZEND_TRY_ASSIGN_REF_LONG(r, red); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(g, green); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(b, blue); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(a, alpha); if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}
PHP_FUNCTION(SDL_SetRenderDrawBlendMode)
{
	zval *value; zend_long mode;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zl", &value, &mode) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	RETURN_LONG(SDL_SetRenderDrawBlendMode(renderer, mode));
}
PHP_FUNCTION(SDL_GetRenderDrawBlendMode)
{
	zval *value, *output;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zz", &value, &output) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	SDL_BlendMode mode = SDL_BLENDMODE_NONE; int result = SDL_GetRenderDrawBlendMode(renderer, &mode);
	if (result == 0) { ZEND_TRY_ASSIGN_REF_LONG(output, mode); }
	if (EG(exception)) { RETURN_THROWS(); } RETURN_LONG(result);
}

static void renderer_set_rect(INTERNAL_FUNCTION_PARAMETERS, zend_bool clip)
{
	zval *value, *object;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zO!", &value, &object, get_php_sdl_rect_ce()) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	SDL_Rect rect, *pointer = NULL;
	if (object) {
		if (!primitive_value(object, get_php_sdl_rect_ce(), "x", &rect.x, 0)
			|| !primitive_value(object, get_php_sdl_rect_ce(), "y", &rect.y, 0)
			|| !primitive_value(object, get_php_sdl_rect_ce(), "w", &rect.w, 0)
			|| !primitive_value(object, get_php_sdl_rect_ce(), "h", &rect.h, 0)) { RETURN_THROWS(); }
		if (rect.w < 0 || rect.h < 0) { zend_value_error("rectangle dimensions must be nonnegative"); RETURN_THROWS(); }
		pointer = &rect;
	}
	renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	RETURN_LONG(clip ? SDL_RenderSetClipRect(renderer, pointer) : SDL_RenderSetViewport(renderer, pointer));
}
static void renderer_get_rect(INTERNAL_FUNCTION_PARAMETERS, zend_bool clip)
{
	zval *value, *output;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zz", &value, &output) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	SDL_Rect rect = {0,0,0,0};
	if (clip) { SDL_RenderGetClipRect(renderer, &rect); } else { SDL_RenderGetViewport(renderer, &rect); }
	zval result; sdl_rect_to_zval(&rect, &result);
	ZEND_TRY_ASSIGN_REF_COPY(output, &result); zval_ptr_dtor(&result);
	if (EG(exception)) { RETURN_THROWS(); }
}
PHP_FUNCTION(SDL_RenderSetViewport) { renderer_set_rect(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0); }
PHP_FUNCTION(SDL_RenderGetViewport) { renderer_get_rect(INTERNAL_FUNCTION_PARAM_PASSTHRU, 0); }
PHP_FUNCTION(SDL_RenderSetClipRect) { renderer_set_rect(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1); }
PHP_FUNCTION(SDL_RenderGetClipRect) { renderer_get_rect(INTERNAL_FUNCTION_PARAM_PASSTHRU, 1); }

PHP_FUNCTION(SDL_RenderSetLogicalSize)
{
	zval *value; zend_long width, height;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zll", &value, &width, &height) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	if (!geometry_count(width) || !geometry_count(height)) { RETURN_THROWS(); }
	RETURN_LONG(SDL_RenderSetLogicalSize(renderer, width, height));
}
PHP_FUNCTION(SDL_RenderGetLogicalSize)
{
	zval *value, *w, *h;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zzz", &value, &w, &h) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	int width = 0, height = 0; SDL_RenderGetLogicalSize(renderer, &width, &height);
	ZEND_TRY_ASSIGN_REF_LONG(w, width); if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(h, height); if (EG(exception)) { RETURN_THROWS(); }
}
PHP_FUNCTION(SDL_RenderSetIntegerScale)
{
	zval *value; zend_bool enabled;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zb", &value, &enabled) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	RETURN_LONG(SDL_RenderSetIntegerScale(renderer, enabled));
}
PHP_FUNCTION(SDL_RenderSetScale)
{
	zval *value; double x, y;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zdd", &value, &x, &y) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	if (!isfinite(x) || !isfinite(y) || !isfinite((float)x) || !isfinite((float)y)) {
		zend_value_error("render scale must fit finite float32"); RETURN_THROWS();
	}
	RETURN_LONG(SDL_RenderSetScale(renderer, x, y));
}
PHP_FUNCTION(SDL_RenderGetScale)
{
	zval *value, *x, *y;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zzz", &value, &x, &y) == FAILURE) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	float scale_x = 1, scale_y = 1; SDL_RenderGetScale(renderer, &scale_x, &scale_y);
	ZEND_TRY_ASSIGN_REF_DOUBLE(x, scale_x); if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_DOUBLE(y, scale_y); if (EG(exception)) { RETURN_THROWS(); }
}

/*
 * SDL's reverse conversion casts a float to int without checking its range.
 * Probe the inverse at both int32 limits, leaving space for float32 rounding.
 * Moving each logical bound inward also covers rounding of a large viewport
 * offset before cancellation. If the inverse has insufficient precision to
 * distinguish its limits, reject it instead of guessing at a native result.
 */
static zend_bool renderer_coordinate_range(float value, float first, float last)
{
	if (!isfinite(first) || !isfinite(last) || first == last) { return 0; }
	float low = fminf(first, last), high = fmaxf(first, last);
	for (int step = 0; step < 8; step++) {
		low = nextafterf(low, INFINITY);
		high = nextafterf(high, -INFINITY);
	}
	return value >= low && value <= high;
}

PHP_FUNCTION(SDL_RenderWindowToLogical)
{
	zval *value, *out_x, *out_y;
	zend_long x, y;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zllzz", &value, &x, &y, &out_x, &out_y) == FAILURE) { RETURN_THROWS(); }
	if (x < INT_MIN || x > INT_MAX || y < INT_MIN || y > INT_MAX) {
		zend_value_error("window coordinates must fit int32"); RETURN_THROWS();
	}
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	float logical_x = 0, logical_y = 0;
	SDL_RenderWindowToLogical(renderer, x, y, &logical_x, &logical_y);
	if (!isfinite(logical_x) || !isfinite(logical_y)) {
		zend_value_error("renderer transform must produce finite logical coordinates"); RETURN_THROWS();
	}
	/* A replaced output may destroy the renderer or unset the other variable. */
	zval outputs[2]; ZVAL_COPY(&outputs[0], out_x); ZVAL_COPY(&outputs[1], out_y);
	ZEND_TRY_ASSIGN_REF_DOUBLE(&outputs[0], logical_x);
	if (!EG(exception)) { ZEND_TRY_ASSIGN_REF_DOUBLE(&outputs[1], logical_y); }
	zval_ptr_dtor(&outputs[0]); zval_ptr_dtor(&outputs[1]);
	if (EG(exception)) { RETURN_THROWS(); }
}

PHP_FUNCTION(SDL_RenderLogicalToWindow)
{
	zval *value, *out_x, *out_y;
	double x, y;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zddzz", &value, &x, &y, &out_x, &out_y) == FAILURE) { RETURN_THROWS(); }
	if (!isfinite(x) || !isfinite(y) || !isfinite((float)x) || !isfinite((float)y)) {
		zend_value_error("logical coordinates must fit finite float32"); RETURN_THROWS();
	}
	SDL_Renderer *renderer = php_sdl_renderer(value); if (!renderer) { RETURN_THROWS(); }
	float scale_x = 1, scale_y = 1;
	SDL_RenderGetScale(renderer, &scale_x, &scale_y);
	/* SDL multiplies in float32 before adding its double-precision viewport. */
	if (!isfinite((float)x * scale_x) || !isfinite((float)y * scale_y)) {
		zend_value_error("scaled logical coordinates must fit finite float32"); RETURN_THROWS();
	}
	float first_x = 0, first_y = 0, last_x = 0, last_y = 0;
	SDL_RenderWindowToLogical(renderer, INT_MIN + 4096, INT_MIN + 4096, &first_x, &first_y);
	SDL_RenderWindowToLogical(renderer, INT_MAX - 4096, INT_MAX - 4096, &last_x, &last_y);
	if (!renderer_coordinate_range(x, first_x, last_x) || !renderer_coordinate_range(y, first_y, last_y)) {
		zend_value_error("renderer transform cannot safely represent these window coordinates"); RETURN_THROWS();
	}
	int window_x = 0, window_y = 0;
	SDL_RenderLogicalToWindow(renderer, x, y, &window_x, &window_y);
	zval outputs[2]; ZVAL_COPY(&outputs[0], out_x); ZVAL_COPY(&outputs[1], out_y);
	ZEND_TRY_ASSIGN_REF_LONG(&outputs[0], window_x);
	if (!EG(exception)) { ZEND_TRY_ASSIGN_REF_LONG(&outputs[1], window_y); }
	zval_ptr_dtor(&outputs[0]); zval_ptr_dtor(&outputs[1]);
	if (EG(exception)) { RETURN_THROWS(); }
}

PHP_MINIT_FUNCTION(sdl_geometry)
{
	return zend_register_functions(NULL, ext_functions, NULL, MODULE_PERSISTENT);
}
