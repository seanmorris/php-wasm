/* PHP SDL texture buffers and ownership. Distributed under the PHP license. */
#include "php_sdl_extra.h"
#include "pixels.h"
#include "rect.h"
#include <limits.h>

extern int le_sdl_renderer, le_sdl_texture;
typedef struct render_handle {
	zend_resource *resource;
	SDL_Renderer *renderer;
	SDL_Window *window;
	SDL_GLContext context;
	zend_bool texture, closing;
	Uint64 lock_serial;
	void *locked;
	int native_pitch, row_bytes, height;
	zval pixels;
	struct render_handle *next;
} render_handle;
static render_handle *handles;
static Uint64 next_lock_serial;

SDL_Renderer *php_sdl_renderer(zval *value)
{
	return zend_fetch_resource_ex(value, "SDL Renderer", le_sdl_renderer);
}

SDL_Texture *php_sdl_texture(zval *value)
{
	return zend_fetch_resource_ex(value, "SDL Texture", le_sdl_texture);
}

static render_handle *find_handle(zend_resource *resource)
{
	/* Zend passes a stack copy to destructors; the resource ID is stable. */
	for (render_handle *handle = handles; handle; handle = handle->next) {
		if (handle->resource->handle == resource->handle) { return handle; }
	}
	return NULL;
}

static zend_resource *register_handle(void *pointer, SDL_Renderer *renderer, SDL_Window *window, zend_bool texture)
{
	render_handle *handle = ecalloc(1, sizeof(*handle));
	handle->resource = zend_register_resource(pointer, texture ? le_sdl_texture : le_sdl_renderer);
	handle->renderer = renderer;
	handle->window = window;
	handle->texture = texture;
	if (!texture) {
		SDL_RendererInfo info;
		if (SDL_GetRendererInfo(renderer, &info) == 0 && (info.flags & SDL_RENDERER_ACCELERATED)) {
			handle->context = SDL_GL_GetCurrentContext();
		}
	}
	ZVAL_UNDEF(&handle->pixels);
	handle->next = handles;
	handles = handle;
	return handle->resource;
}

zend_resource *php_sdl_register_renderer(SDL_Renderer *renderer, SDL_Window *window)
{
	return register_handle(renderer, renderer, window, 0);
}

zend_resource *php_sdl_register_texture(SDL_Texture *texture, SDL_Renderer *renderer)
{
	return register_handle(texture, renderer, NULL, 1);
}

zend_bool php_sdl_renderer_owns_context(SDL_GLContext context)
{
	for (render_handle *handle = handles; handle; handle = handle->next) {
		if (!handle->texture && handle->context && handle->resource->ptr
			&& (!context || handle->context == context)) { return 1; }
	}
	return 0;
}

SDL_Window *php_sdl_renderer_context_window(SDL_GLContext context)
{
	for (render_handle *handle = handles; handle; handle = handle->next) {
		if (!handle->texture && handle->context == context) { return handle->window; }
	}
	return NULL;
}

void php_sdl_render_forget(void)
{
	/* SDL has already destroyed the subsystem: close PHP resources only. */
	for (render_handle *handle = handles; handle; handle = handle->next) { handle->resource->ptr = NULL; }
	php_sdl_render_close(NULL);
}

static void remove_handle(render_handle *handle)
{
	render_handle **link = &handles;
	while (*link != handle) { link = &(*link)->next; }
	*link = handle->next;
	if (!Z_ISUNDEF(handle->pixels)) { zval_ptr_dtor(&handle->pixels); }
	efree(handle);
}

void php_sdl_texture_free(zend_resource *resource)
{
	render_handle *handle = find_handle(resource);
	if (!handle || handle->closing) { return; }
	handle->closing = 1;
	if (handle->locked && resource->ptr) { SDL_UnlockTexture(resource->ptr); }
	if (resource->ptr) { SDL_DestroyTexture(resource->ptr); }
	remove_handle(handle);
}

void php_sdl_renderer_free(zend_resource *resource)
{
	render_handle *handle = find_handle(resource);
	if (!handle || handle->closing) { return; }
	handle->closing = 1;
	/* Re-scan after each close: releasing a child may invoke PHP destructors. */
	for (;;) {
		render_handle *match = NULL;
		for (render_handle *child = handles; child; child = child->next) {
			if (child->texture && child->renderer == handle->renderer && !child->closing) { match = child; break; }
		}
		if (!match) { break; }
		zend_list_close(match->resource);
	}
	if (resource->ptr) { SDL_DestroyRenderer(resource->ptr); }
	remove_handle(handle);
}

void php_sdl_render_close(SDL_Window *window)
{
	for (;;) {
		render_handle *match = NULL;
		for (render_handle *handle = handles; handle; handle = handle->next) {
			if (!handle->texture && !handle->closing && (!window || handle->window == window)) { match = handle; break; }
		}
		if (!match) { break; }
		zend_list_close(match->resource);
	}
}

/* Packed formats only. Planar YUV needs separate plane sizes and pitches. */
static zend_bool texture_rect(SDL_Texture *texture, zend_bool specified, SDL_Rect *rect, int *row_bytes)
{
	Uint32 format;
	int width, height;
	if (SDL_QueryTexture(texture, &format, NULL, &width, &height) < 0) { return 0; }
	if (SDL_ISPIXELFORMAT_FOURCC(format) || SDL_ISPIXELFORMAT_INDEXED(format)) {
		zend_value_error("texture pixels require a packed, non-indexed format"); return 0;
	}
	if (!specified) { *rect = (SDL_Rect){0, 0, width, height}; }
	if (rect->x < 0 || rect->y < 0 || rect->w <= 0 || rect->h <= 0
		|| rect->x > width || rect->y > height || rect->w > width - rect->x || rect->h > height - rect->y) {
		zend_value_error("rectangle must lie inside the texture and have positive dimensions"); return 0;
	}
	int bytes = SDL_BYTESPERPIXEL(format);
	if (!bytes || rect->w > INT_MAX / bytes) { zend_value_error("texture row is too large"); return 0; }
	*row_bytes = rect->w * bytes;
	return 1;
}

PHP_FUNCTION(SDL_UpdateTexture)
{
	zval *value, *rect_value, *pixels_value;
	zend_long pitch;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zO!zl", &value, &rect_value, get_php_sdl_rect_ce(), &pixels_value, &pitch) == FAILURE) { RETURN_THROWS(); }
	SDL_Rect rect;
	if (rect_value && !php_sdl_read_rect(rect_value, &rect)) { RETURN_THROWS(); }
	SDL_Texture *texture = php_sdl_texture(value);
	if (!texture) { RETURN_THROWS(); }
	render_handle *handle = find_handle(Z_RES_P(value));
	if (handle->locked) { zend_throw_error(NULL, "texture is already locked"); RETURN_THROWS(); }
	int row_bytes;
	if (!texture_rect(texture, rect_value != NULL, &rect, &row_bytes)) { if (EG(exception)) { RETURN_THROWS(); } RETURN_LONG(-1); }
	if (pitch < row_bytes || pitch > INT_MAX || (size_t)pitch > SIZE_MAX / rect.h) {
		zend_value_error("pitch must fit the row and buffer"); RETURN_THROWS();
	}
	const void *pixels;
	size_t length;
	if (Z_TYPE_P(pixels_value) == IS_STRING) {
		pixels = Z_STRVAL_P(pixels_value); length = Z_STRLEN_P(pixels_value);
	} else {
		SDL_Pixels *buffer = zval_to_sdl_pixels(pixels_value);
		if (EG(exception)) { RETURN_THROWS(); }
		if (!buffer || !buffer->pixels || buffer->pitch <= 0 || buffer->h <= 0) {
			zend_type_error("pixels must be packed bytes or SDL_Pixels"); RETURN_THROWS();
		}
		pixels = buffer->pixels; length = (size_t)buffer->pitch * buffer->h;
	}
	size_t required = (size_t)pitch * (rect.h - 1) + row_bytes;
	if (length < required) { zend_value_error("pixel buffer is too small for the rectangle and pitch"); RETURN_THROWS(); }
	RETURN_LONG(SDL_UpdateTexture(texture, &rect, pixels, pitch));
}

PHP_FUNCTION(SDL_LockTexture)
{
	zval *value, *rect_value, *pixels_value, *pitch_value;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zO!zz", &value, &rect_value, get_php_sdl_rect_ce(), &pixels_value, &pitch_value) == FAILURE) { RETURN_THROWS(); }
	SDL_Rect rect;
	if (rect_value && !php_sdl_read_rect(rect_value, &rect)) { RETURN_THROWS(); }
	SDL_Texture *texture = php_sdl_texture(value);
	if (!texture) { RETURN_THROWS(); }
	render_handle *handle = find_handle(Z_RES_P(value));
	if (handle->locked) { zend_throw_error(NULL, "texture is already locked"); RETURN_THROWS(); }
	int row_bytes;
	if (!texture_rect(texture, rect_value != NULL, &rect, &row_bytes)) { if (EG(exception)) { RETURN_THROWS(); } RETURN_LONG(-1); }
	if (row_bytes > INT_MAX - 3 || ((row_bytes + 3) & ~3) > INT_MAX / rect.h) {
		zend_value_error("locked buffer is too large"); RETURN_THROWS();
	}
	SDL_Pixels buffer = {rect.h, (row_bytes + 3) & ~3, NULL};
	buffer.pixels = ecalloc(buffer.pitch, buffer.h);
	int result = SDL_LockTexture(texture, &rect, &handle->locked, &handle->native_pitch);
	if (result < 0) { efree(buffer.pixels); handle->locked = NULL; RETURN_LONG(result); }
	handle->row_bytes = row_bytes;
	handle->height = rect.h;
	Uint64 serial = handle->lock_serial = ++next_lock_serial;
	/* Output replacement may destroy the texture, unlock it, or start a new lock.
	 * Keep independent local references; never assign from storage in the handle. */
	zval pixels, resource; sdl_pixels_to_zval(&buffer, &pixels, 0);
	ZVAL_COPY(&handle->pixels, &pixels);
	ZVAL_COPY(&resource, value);
	ZEND_TRY_ASSIGN_REF_COPY(pixels_value, &pixels);
	handle = find_handle(Z_RES(resource));
	zend_bool current = handle && handle->locked && handle->lock_serial == serial;
	if (!EG(exception) && current) {
		ZEND_TRY_ASSIGN_REF_LONG(pitch_value, buffer.pitch);
		handle = find_handle(Z_RES(resource));
		current = handle && handle->locked && handle->lock_serial == serial;
	}
	if (!current && !EG(exception)) { zend_throw_error(NULL, "texture lock changed while assigning outputs"); }
	if (EG(exception) && current) {
		SDL_UnlockTexture(Z_RES(resource)->ptr);
		handle->locked = NULL;
		zval stored; ZVAL_COPY_VALUE(&stored, &handle->pixels); ZVAL_UNDEF(&handle->pixels);
		zval_ptr_dtor(&stored);
	}
	zval_ptr_dtor(&pixels); zval_ptr_dtor(&resource);
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(0);
}

PHP_FUNCTION(SDL_UnlockTexture)
{
	zval *value;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "z", &value) == FAILURE) { RETURN_THROWS(); }
	SDL_Texture *texture = php_sdl_texture(value);
	if (!texture) { RETURN_THROWS(); }
	render_handle *handle = find_handle(Z_RES_P(value));
	if (!handle->locked) { zend_throw_error(NULL, "texture is not locked"); RETURN_THROWS(); }
	SDL_Pixels *buffer = zval_to_sdl_pixels(&handle->pixels);
	zend_bool valid = buffer && buffer->pixels && buffer->pitch >= handle->row_bytes && buffer->h >= handle->height;
	if (valid) {
		for (int row = 0; row < handle->height; row++) {
			memcpy((char *)handle->locked + (size_t)row * handle->native_pitch,
				buffer->pixels + (size_t)row * buffer->pitch, handle->row_bytes);
		}
	}
	SDL_UnlockTexture(texture);
	handle->locked = NULL;
	zval stored; ZVAL_COPY_VALUE(&stored, &handle->pixels); ZVAL_UNDEF(&handle->pixels);
	zval_ptr_dtor(&stored);
	if (!valid) { zend_throw_error(NULL, "locked pixel buffer was resized"); RETURN_THROWS(); }
}

PHP_FUNCTION(SDL_SetTextureColorMod)
{
	zval *value; zend_long r, g, b;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zlll", &value, &r, &g, &b) == FAILURE) { RETURN_THROWS(); }
	SDL_Texture *texture = php_sdl_texture(value);
	if (!texture) { RETURN_THROWS(); }
	if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) { zend_value_error("color components must be between 0 and 255"); RETURN_THROWS(); }
	RETURN_LONG(SDL_SetTextureColorMod(texture, r, g, b));
}

PHP_FUNCTION(SDL_GetTextureColorMod)
{
	zval *value, *r, *g, *b; Uint8 red, green, blue;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zzzz", &value, &r, &g, &b) == FAILURE) { RETURN_THROWS(); }
	SDL_Texture *texture = php_sdl_texture(value);
	if (!texture) { RETURN_THROWS(); }
	int result = SDL_GetTextureColorMod(texture, &red, &green, &blue);
	if (!result) { ZEND_TRY_ASSIGN_REF_LONG(r, red); ZEND_TRY_ASSIGN_REF_LONG(g, green); ZEND_TRY_ASSIGN_REF_LONG(b, blue); }
	RETURN_LONG(result);
}

#define TEXTURE_SET(name, type, minimum, maximum) PHP_FUNCTION(name) \
{ zval *value; zend_long setting; \
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zl", &value, &setting) == FAILURE) { RETURN_THROWS(); } \
	SDL_Texture *texture = php_sdl_texture(value); if (!texture) { RETURN_THROWS(); } \
	if (setting < minimum || setting > maximum) { zend_value_error("texture setting is out of range"); RETURN_THROWS(); } \
	RETURN_LONG(name(texture, (type)setting)); }
#define TEXTURE_GET(name, type) PHP_FUNCTION(name) \
{ zval *value, *output; type setting; \
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zz", &value, &output) == FAILURE) { RETURN_THROWS(); } \
	SDL_Texture *texture = php_sdl_texture(value); if (!texture) { RETURN_THROWS(); } \
	int result = name(texture, &setting); if (!result) { ZEND_TRY_ASSIGN_REF_LONG(output, setting); } RETURN_LONG(result); }
TEXTURE_SET(SDL_SetTextureAlphaMod, Uint8, 0, 255)
TEXTURE_GET(SDL_GetTextureAlphaMod, Uint8)
TEXTURE_SET(SDL_SetTextureBlendMode, SDL_BlendMode, 0, INT_MAX)
TEXTURE_GET(SDL_GetTextureBlendMode, SDL_BlendMode)
TEXTURE_SET(SDL_SetTextureScaleMode, SDL_ScaleMode, SDL_ScaleModeNearest, SDL_ScaleModeBest)
TEXTURE_GET(SDL_GetTextureScaleMode, SDL_ScaleMode)

/* Return owned bytes; no output pointer or caller-sized allocation. */
PHP_FUNCTION(SDL_RenderReadPixels)
{
	zval *value, *rect_value; zend_long format;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zO!l", &value, &rect_value, get_php_sdl_rect_ce(), &format) == FAILURE) { RETURN_THROWS(); }
	SDL_Rect requested;
	if (rect_value && !php_sdl_read_rect(rect_value, &requested)) { RETURN_THROWS(); }
	SDL_Renderer *renderer = php_sdl_renderer(value);
	if (!renderer) { RETURN_THROWS(); }
	SDL_Rect rect = {0};
	SDL_Texture *target = SDL_GetRenderTarget(renderer);
	int result = target ? SDL_QueryTexture(target, NULL, NULL, &rect.w, &rect.h) : SDL_GetRendererOutputSize(renderer, &rect.w, &rect.h);
	if (result < 0) { RETURN_NULL(); }
	int width = rect.w, height = rect.h;
	if (rect_value) { rect = requested; }
	SDL_PixelFormat *pixel_format = SDL_AllocFormat((Uint32)format);
	if (!pixel_format || SDL_ISPIXELFORMAT_FOURCC(format) || SDL_ISPIXELFORMAT_INDEXED(format)) {
		SDL_FreeFormat(pixel_format); zend_value_error("format must be a packed, non-indexed pixel format"); RETURN_THROWS();
	}
	int bytes = pixel_format->BytesPerPixel;
	SDL_FreeFormat(pixel_format);
	if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0 || rect.x > width || rect.y > height
		|| rect.w > width - rect.x || rect.h > height - rect.y || !bytes || rect.w > INT_MAX / bytes || rect.w * bytes > INT_MAX / rect.h) {
		zend_value_error("read rectangle is outside the target or too large"); RETURN_THROWS();
	}
	int pitch = rect.w * bytes;
	zend_string *buffer = zend_string_alloc((size_t)pitch * rect.h, 0);
	memset(ZSTR_VAL(buffer), 0, ZSTR_LEN(buffer));
	result = SDL_RenderReadPixels(renderer, &rect, format, ZSTR_VAL(buffer), pitch);
	if (result < 0) { zend_string_release(buffer); RETURN_NULL(); }
	ZSTR_VAL(buffer)[ZSTR_LEN(buffer)] = 0;
	RETURN_STR(buffer);
}
