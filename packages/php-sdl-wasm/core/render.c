/*
  +----------------------------------------------------------------------+
  | Copyright (c) 1997-2018 The PHP Group                                |
  +----------------------------------------------------------------------+
  | This source file is subject to version 3.01 of the PHP license,      |
  | that is bundled with this package in the file LICENSE, and is        |
  | available through the world-wide-web at the following url:           |
  | https://www.php.net/license/3_01.txt                                 |
  | If you did not receive a copy of the PHP license and are unable to   |
  | obtain it through the world-wide-web, please send a note to          |
  | license@php.net so we can mail you a copy immediately.               |
  +----------------------------------------------------------------------+
  | Authors: Santiago Lizardo <santiagolizardo@php.net>                  |
  |          Remi Collet <remi@php.net>                                  |
  +----------------------------------------------------------------------+
*/

#include "render.h"
#include "php_sdl_extra.h"
#include "window.h"
#include "surface.h"
#include "rect.h"

#define SDL_RENDERER_RES_NAME "SDL Renderer"
int le_sdl_renderer;

#define SDL_TEXTURE_RES_NAME "SDL Texture"
int le_sdl_texture;

PHP_FUNCTION(SDL_SetRenderDrawColor)
{
	zval *z_renderer;
	zend_long r, g, b, a;
	SDL_Renderer *renderer;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zllll", &z_renderer, &r, &g, &b, &a) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	RETURN_LONG(SDL_SetRenderDrawColor(renderer, r, g, b, a));
}

PHP_FUNCTION(SDL_RenderClear)
{
	zval *z_renderer;
	SDL_Renderer *renderer;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "z", &z_renderer) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderClear(renderer));
}

PHP_FUNCTION(SDL_DestroyRenderer)
{
	zval *z_renderer;
	SDL_Renderer *renderer;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "z", &z_renderer) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	zend_list_close(Z_RES_P(z_renderer));
}

PHP_FUNCTION(SDL_DestroyTexture)
{
	zval *z_texture;
	SDL_Texture *texture;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "z", &z_texture) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

    texture = php_sdl_texture(z_texture);
	if (!texture) { RETURN_THROWS(); }

	zend_list_close(Z_RES_P(z_texture));
}

PHP_FUNCTION(SDL_RenderFillRect)
{
	zval *z_renderer = NULL;
	zval *z_rect = NULL;
	SDL_Rect rect;
	SDL_Renderer *renderer = NULL;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zO", &z_renderer, &z_rect, get_php_sdl_rect_ce()) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	if (!php_sdl_read_rect(z_rect, &rect)) { RETURN_THROWS(); }

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderFillRect(renderer, &rect));
}

PHP_FUNCTION(SDL_RenderDrawRect)
{
	zval *z_renderer = NULL;
	zval *z_rect = NULL;
	SDL_Rect rect;
	SDL_Renderer *renderer = NULL;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zO", &z_renderer, &z_rect, get_php_sdl_rect_ce()) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	if (!php_sdl_read_rect(z_rect, &rect)) { RETURN_THROWS(); }

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderDrawRect(renderer, &rect));
}

PHP_FUNCTION(SDL_RenderDrawLine)
{
	zval *z_renderer = NULL;
	SDL_Renderer *renderer = NULL;
	zend_long x1, y1, x2, y2;

	ZEND_PARSE_PARAMETERS_START(5, 5)
		Z_PARAM_ZVAL(z_renderer)
		Z_PARAM_LONG(x1)
		Z_PARAM_LONG(y1)
		Z_PARAM_LONG(x2)
		Z_PARAM_LONG(y2)
	ZEND_PARSE_PARAMETERS_END();

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderDrawLine(renderer, (int)x1, (int)y1, (int)x2, (int)y2));
}

PHP_FUNCTION(SDL_RenderPresent)
{
	zval *z_renderer;
	SDL_Renderer *renderer;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "z", &z_renderer) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	SDL_RenderPresent(renderer);
}

PHP_FUNCTION(SDL_RenderDrawPoint)
{
	zval *z_renderer = NULL;
	SDL_Renderer *renderer = NULL;
	zend_long x, y;

	ZEND_PARSE_PARAMETERS_START(3, 3)
		Z_PARAM_ZVAL(z_renderer)
		Z_PARAM_LONG(x)
		Z_PARAM_LONG(y)
	ZEND_PARSE_PARAMETERS_END();

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderDrawPoint(renderer, (int)x, (int)y));
}

PHP_FUNCTION(SDL_CreateTextureFromSurface)
{
	zval *z_renderer, *z_surface;
	SDL_Renderer *renderer = NULL;
	SDL_Surface *surface = NULL;

	SDL_Texture *texture = NULL;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zO", &z_renderer, &z_surface, get_php_sdl_surface_ce() ) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

    renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }
	surface = zval_to_sdl_surface(z_surface);
	if (!surface) { zend_throw_error(NULL, "SDL surface has been destroyed"); RETURN_THROWS(); }

	if( renderer && surface ) {
		texture = SDL_CreateTextureFromSurface(renderer, surface);
		if (!texture) { RETURN_NULL(); }
		RETURN_RES(php_sdl_register_texture(texture, renderer));
	}
}

PHP_FUNCTION(SDL_CreateTexture)
{
	zval *z_renderer;
	zend_long format, access, w, h;
	SDL_Renderer *renderer = NULL;

	SDL_Texture *texture = NULL;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zllll", &z_renderer, &format, &access, &w, &h ) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	if( renderer ) {
		texture = SDL_CreateTexture(renderer, format, access, w, h);
		if (!texture) { RETURN_NULL(); }
		RETURN_RES(php_sdl_register_texture(texture, renderer));
	}
}

PHP_FUNCTION(SDL_SetRenderTarget)
{
	zval *z_renderer, *z_texture;
	SDL_Renderer *renderer = NULL;
	SDL_Texture *texture = NULL;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zz", &z_renderer, &z_texture ) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }
	if (Z_TYPE_P(z_texture) != IS_NULL) {
		texture = php_sdl_texture(z_texture);
		if (!texture) { RETURN_THROWS(); }
	}

	if( renderer ) {
		RETURN_LONG(SDL_SetRenderTarget(renderer, texture));
	}
}

PHP_FUNCTION(SDL_CreateRenderer)
{
	zend_long index, flags;
	zval *z_window;
	SDL_Window *window = NULL;
	SDL_Renderer *renderer = NULL;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "Oll", &z_window, get_php_sdl_window_ce(), &index, &flags) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	if( z_window != NULL ) {
		window = zval_to_sdl_window(z_window);
	}

	if (!window) { zend_throw_error(NULL, "SDL window has been destroyed"); RETURN_THROWS(); }
	if (!php_sdl_context_available()) { RETURN_THROWS(); }
	renderer = SDL_CreateRenderer(window, (int)index, (Uint32)flags);
	if (!renderer) { RETURN_NULL(); }
	RETURN_RES(php_sdl_register_renderer(renderer, window));
}

PHP_FUNCTION(SDL_RenderCopy)
{
	zval *z_renderer, *z_texture;
	zval *z_srcrect, *z_dstrect;
	SDL_Renderer *renderer = NULL;
	SDL_Texture *texture = NULL;
	SDL_Rect *srcrect = NULL, *dstrect = NULL;
	SDL_Rect def_srcrect, def_dstrect;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zzO!O!", &z_renderer, &z_texture, &z_srcrect, get_php_sdl_rect_ce(), &z_dstrect, get_php_sdl_rect_ce()) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	if(z_srcrect != NULL && Z_TYPE_P(z_srcrect) != IS_NULL) {
		srcrect = &def_srcrect;
		if (!php_sdl_read_rect(z_srcrect, srcrect)) { RETURN_THROWS(); }
	}
	if(z_dstrect != NULL && Z_TYPE_P(z_dstrect) != IS_NULL) {
		dstrect = &def_dstrect;
		if (!php_sdl_read_rect(z_dstrect, dstrect)) { RETURN_THROWS(); }
	}

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }
	texture = php_sdl_texture(z_texture);
	if (!texture) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderCopy(renderer, texture, srcrect, dstrect));
}

PHP_FUNCTION(SDL_RenderCopyEx)
{
	zval *z_renderer, *z_texture;
	zval *z_srcrect, *z_dstrect;
	zval *z_center;
	SDL_Renderer *renderer = NULL;
	SDL_Texture *texture = NULL;
	SDL_Rect *srcrect = NULL, *dstrect = NULL;
	SDL_Rect def_srcrect, def_dstrect;
	double angle;
	SDL_Point *center = NULL;
	SDL_Point def_center;
	zend_long flip;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zzO!O!dO!l", &z_renderer, &z_texture, &z_srcrect, get_php_sdl_rect_ce(), &z_dstrect, get_php_sdl_rect_ce(), &angle, &z_center, get_php_sdl_point_ce(), &flip) == FAILURE ) {
		WRONG_PARAM_COUNT;
	}

	if(z_srcrect != NULL && Z_TYPE_P(z_srcrect) != IS_NULL) {
		srcrect = &def_srcrect;
		if (!php_sdl_read_rect(z_srcrect, srcrect)) { RETURN_THROWS(); }
	}
	if(z_dstrect != NULL && Z_TYPE_P(z_dstrect) != IS_NULL) {
		dstrect = &def_dstrect;
		if (!php_sdl_read_rect(z_dstrect, dstrect)) { RETURN_THROWS(); }
	}
	if(z_center != NULL && Z_TYPE_P(z_center) != IS_NULL) {
		center = &def_center;
		if (!php_sdl_read_point(z_center, center)) { RETURN_THROWS(); }
	}

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }
	texture = php_sdl_texture(z_texture);
	if (!texture) { RETURN_THROWS(); }

	RETURN_LONG(SDL_RenderCopyEx(renderer, texture, srcrect, dstrect, angle, center, (Uint32)flip));
}

PHP_FUNCTION(SDL_GetRendererOutputSize)
{
	zval *z_renderer, *z_width=NULL, *z_height=NULL;
	SDL_Renderer *renderer;
	int w, h;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zzz", &z_renderer, &z_width, &z_height) == FAILURE ) {
		return;
	}

	renderer = php_sdl_renderer(z_renderer);
	if (!renderer) { RETURN_THROWS(); }

	if (SDL_GetRendererOutputSize(renderer, &w, &h) < 0) { return; }

	ZEND_TRY_ASSIGN_REF_LONG(z_width, w);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_height, h);
	if (EG(exception)) { RETURN_THROWS(); }
}

PHP_FUNCTION(SDL_QueryTexture)
{
	zval *z_texture, *z_format, *z_access, *z_width, *z_height;
	SDL_Texture *texture;
	int w, h, access, result;
	Uint32 format;

	if( zend_parse_parameters(ZEND_NUM_ARGS(), "zzzzz", &z_texture, &z_format, &z_access, &z_width, &z_height) == FAILURE ) {
		return;
	}

	texture = php_sdl_texture(z_texture);
	if (!texture) { RETURN_THROWS(); }

	result = SDL_QueryTexture(texture, &format, &access, &w, &h);
	if (result < 0) { RETURN_LONG(result); }

	ZEND_TRY_ASSIGN_REF_LONG(z_format, format);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_access, access);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_width, w);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_height, h);
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RenderDrawPointF)
{
	zval *RENDERER;
	SDL_Renderer *renderer;
	double x, y;

	ZEND_PARSE_PARAMETERS_START(3, 3);
		//Z_PARAM_OBJECT_OF_CLASS(RENDERER, sdl_renderer_ce)
		Z_PARAM_ZVAL(RENDERER)
		Z_PARAM_DOUBLE(x)
		Z_PARAM_DOUBLE(y)
	ZEND_PARSE_PARAMETERS_END();
//	renderer = php_sdl_renderer_from_zval_p(RENDERER);
	renderer = php_sdl_renderer(RENDERER);
	if (!renderer) { RETURN_THROWS(); }

	int result = SDL_RenderDrawPointF(renderer, (float) x, (float) y);

	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RenderDrawLineF)
{
	zval *RENDERER;
	SDL_Renderer *renderer;
	double x1, y1, x2, y2;

	ZEND_PARSE_PARAMETERS_START(5, 5);
		//Z_PARAM_OBJECT_OF_CLASS(RENDERER, sdl_renderer_ce)
		Z_PARAM_ZVAL(RENDERER)
		Z_PARAM_DOUBLE(x1)
		Z_PARAM_DOUBLE(y1)
		Z_PARAM_DOUBLE(x2)
		Z_PARAM_DOUBLE(y2)
	ZEND_PARSE_PARAMETERS_END();
	//renderer = php_sdl_renderer_from_zval_p(RENDERER);
	renderer = php_sdl_renderer(RENDERER);
	if (!renderer) { RETURN_THROWS(); }

	int result = SDL_RenderDrawLineF(renderer, (float) x1, (float) y1, (float) x2, (float) y2);

	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RenderDrawRectF)
{
	zval *RENDERER;
	SDL_Renderer *renderer;
	zval *RECT;
	SDL_FRect rect;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		//Z_PARAM_OBJECT_OF_CLASS(RENDERER, sdl_renderer_ce)
		Z_PARAM_ZVAL(RENDERER)
		Z_PARAM_OBJECT_OF_CLASS(RECT, get_php_sdl_frect_ce())
	ZEND_PARSE_PARAMETERS_END();
	//renderer = php_sdl_renderer_from_zval_p(RENDERER);
	if (!php_sdl_read_frect(RECT, &rect)) { RETURN_THROWS(); }
	renderer = php_sdl_renderer(RENDERER);
	if (!renderer) { RETURN_THROWS(); }

	int result = SDL_RenderDrawRectF(renderer, (const SDL_FRect*) &rect);

	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RenderFillRectF)
{
	zval *RENDERER, *RECT;
	SDL_Renderer *renderer;
	SDL_FRect rect;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		//Z_PARAM_OBJECT_OF_CLASS(RENDERER, sdl_renderer_ce)
		Z_PARAM_ZVAL(RENDERER)
		Z_PARAM_OBJECT_OF_CLASS(RECT, get_php_sdl_frect_ce())
	ZEND_PARSE_PARAMETERS_END();
	//renderer = php_sdl_renderer_from_zval_p(RENDERER);
	if (!php_sdl_read_frect(RECT, &rect)) { RETURN_THROWS(); }
	renderer = php_sdl_renderer(RENDERER);
	if (!renderer) { RETURN_THROWS(); }

	int result = SDL_RenderFillRectF(renderer, (const SDL_FRect*) &rect);

	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RenderCopyF)
{
	zval *RENDERER, *TEXTURE, *SRCRECT, *DSTRECT;
	SDL_Renderer *renderer;
	SDL_Texture *texture;
	SDL_Rect *srcrect = NULL;
	SDL_Rect def_srcrect;
	SDL_FRect *dstrect = NULL;
	SDL_FRect def_dstrect;

	ZEND_PARSE_PARAMETERS_START(4, 4);
		//Z_PARAM_OBJECT_OF_CLASS(RENDERER, sdl_renderer_ce)
		Z_PARAM_ZVAL(RENDERER)
		// Z_PARAM_OBJECT_OF_CLASS(TEXTURE, sdl_texture_ce)
		Z_PARAM_ZVAL(TEXTURE)
		Z_PARAM_OBJECT_OF_CLASS_OR_NULL(SRCRECT, get_php_sdl_rect_ce())
		Z_PARAM_OBJECT_OF_CLASS_OR_NULL(DSTRECT, get_php_sdl_frect_ce())
	ZEND_PARSE_PARAMETERS_END();
	//renderer = php_sdl_renderer_from_zval_p(RENDERER);

	if(SRCRECT != NULL && Z_TYPE_P(SRCRECT) != IS_NULL) {
		srcrect = &def_srcrect;
		if (!php_sdl_read_rect(SRCRECT, srcrect)) { RETURN_THROWS(); }
	}
	if(DSTRECT != NULL && Z_TYPE_P(DSTRECT) != IS_NULL) {
		dstrect = &def_dstrect;
		if (!php_sdl_read_frect(DSTRECT, dstrect)) { RETURN_THROWS(); }
	}

	renderer = php_sdl_renderer(RENDERER);
	if (!renderer) { RETURN_THROWS(); }
	texture = php_sdl_texture(TEXTURE);
	if (!texture) { RETURN_THROWS(); }

	int result = SDL_RenderCopyF(renderer, texture, (const SDL_Rect*) srcrect, (const SDL_FRect*) dstrect);

	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RenderCopyExF)
{
	zval *RENDERER, *TEXTURE, *SRCRECT, *DSTRECT, *CENTER;
	SDL_Renderer *renderer;
	SDL_Texture *texture;
	SDL_Rect *srcrect = NULL;
	SDL_Rect def_srcrect;
	SDL_FRect *dstrect = NULL;;
	SDL_FRect def_dstrect;
	SDL_FPoint *center = NULL;;
	SDL_FPoint def_center;
	// @todo SDL_RendererFlip
	zend_long flip;
	double angle;

	ZEND_PARSE_PARAMETERS_START(7, 7);
		//Z_PARAM_OBJECT_OF_CLASS(RENDERER, sdl_renderer_ce)
		Z_PARAM_ZVAL(RENDERER)
		// Z_PARAM_OBJECT_OF_CLASS(TEXTURE, sdl_texture_ce)
		Z_PARAM_ZVAL(TEXTURE)
		Z_PARAM_OBJECT_OF_CLASS_OR_NULL(SRCRECT, get_php_sdl_rect_ce())
		Z_PARAM_OBJECT_OF_CLASS_OR_NULL(DSTRECT, get_php_sdl_frect_ce())
		Z_PARAM_DOUBLE(angle)
		Z_PARAM_OBJECT_OF_CLASS_OR_NULL(CENTER, get_php_sdl_fpoint_ce())
		Z_PARAM_LONG(flip)
	ZEND_PARSE_PARAMETERS_END();
	//renderer = php_sdl_renderer_from_zval_p(RENDERER);

	if (SRCRECT != NULL && Z_TYPE_P(SRCRECT) != IS_NULL) {
		srcrect = &def_srcrect;
		if (!php_sdl_read_rect(SRCRECT, srcrect)) { RETURN_THROWS(); }
	}
	if (DSTRECT != NULL && Z_TYPE_P(DSTRECT) != IS_NULL) {
		dstrect = &def_dstrect;
		if (!php_sdl_read_frect(DSTRECT, dstrect)) { RETURN_THROWS(); }
	}
	if (CENTER != NULL && Z_TYPE_P(CENTER) != IS_NULL) {
		center = &def_center;
		if (!php_sdl_read_fpoint(CENTER, center)) { RETURN_THROWS(); }
	}

	renderer = php_sdl_renderer(RENDERER);
	if (!renderer) { RETURN_THROWS(); }
	texture = php_sdl_texture(TEXTURE);
	if (!texture) { RETURN_THROWS(); }

	int result = SDL_RenderCopyExF(renderer, texture, (const SDL_Rect*)srcrect, (const SDL_FRect*)dstrect, angle, (const SDL_FPoint*)center, flip);

	RETURN_LONG(result);
}

/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_render)
{
	REGISTER_LONG_CONSTANT("SDL_RENDERER_SOFTWARE", SDL_RENDERER_SOFTWARE, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_RENDERER_ACCELERATED", SDL_RENDERER_ACCELERATED, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_RENDERER_PRESENTVSYNC", SDL_RENDERER_PRESENTVSYNC, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_RENDERER_TARGETTEXTURE", SDL_RENDERER_TARGETTEXTURE, CONST_CS | CONST_PERSISTENT);

	REGISTER_LONG_CONSTANT("SDL_FLIP_NONE", SDL_FLIP_NONE, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_FLIP_HORIZONTAL", SDL_FLIP_HORIZONTAL, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_FLIP_VERTICAL", SDL_FLIP_VERTICAL, CONST_CS | CONST_PERSISTENT);

	REGISTER_LONG_CONSTANT("SDL_TEXTUREACCESS_STATIC", SDL_TEXTUREACCESS_STATIC, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_TEXTUREACCESS_STREAMING", SDL_TEXTUREACCESS_STREAMING, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("SDL_TEXTUREACCESS_TARGET", SDL_TEXTUREACCESS_TARGET, CONST_CS | CONST_PERSISTENT);

	le_sdl_renderer = zend_register_list_destructors_ex(php_sdl_renderer_free, NULL, SDL_RENDERER_RES_NAME, module_number);
	le_sdl_texture = zend_register_list_destructors_ex(php_sdl_texture_free, NULL, SDL_TEXTURE_RES_NAME, module_number);

	return SUCCESS;
}
/* }}} */
