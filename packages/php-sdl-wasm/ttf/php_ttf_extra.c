/* SDL_ttf UTF-8 and font metrics. Distributed under the PHP license. */
#include "sdl_ttf_font.h"
#include "php_ttf_extra_arginfo.h"
#include <limits.h>
extern zend_class_entry *ttf_font_ce;
extern zend_bool sdl_surface_to_zval(SDL_Surface *surface, zval *value);
extern zend_bool php_sdl_read_color(zval *value, SDL_Color *color);

#define FONT(value) TTF_Font *font = php_ttf_font_from_zval_p(value); if (!font) { RETURN_THROWS(); }

/* Text lengths are explicit in PHP; SDL's text APIs use NUL terminators. */
static zend_bool text_valid(const char *text, size_t length)
{
	if (memchr(text, 0, length)) { zend_value_error("text must not contain NUL"); return 0; }
	return 1;
}

PHP_FUNCTION(TTF_RenderUTF8_Solid)
{
	zval *value, *color_value;
	char *text; size_t length;
	SDL_Color color;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Osz", &value, ttf_font_ce, &text, &length, &color_value) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color)) { RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderUTF8_Solid(font, text, color), return_value);
}

PHP_FUNCTION(TTF_RenderUTF8_Solid_Wrapped)
{
	zval *value, *color_value;
	char *text; size_t length;
	SDL_Color color;
	zend_long wrap;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszl", &value, ttf_font_ce, &text, &length, &color_value, &wrap) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color)) { RETURN_THROWS(); }
	if (wrap < 0 || wrap > INT_MAX) { zend_value_error("wrapLength must be between 0 and INT_MAX"); RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderUTF8_Solid_Wrapped(font, text, color, wrap), return_value);
}

PHP_FUNCTION(TTF_RenderUTF8_Blended)
{
	zval *value, *color_value;
	char *text; size_t length;
	SDL_Color color;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Osz", &value, ttf_font_ce, &text, &length, &color_value) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color)) { RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderUTF8_Blended(font, text, color), return_value);
}

PHP_FUNCTION(TTF_RenderUTF8_Blended_Wrapped)
{
	zval *value, *color_value;
	char *text; size_t length;
	SDL_Color color;
	zend_long wrap;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszl", &value, ttf_font_ce, &text, &length, &color_value, &wrap) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color)) { RETURN_THROWS(); }
	if (wrap < 0 || wrap > INT_MAX) { zend_value_error("wrapLength must be between 0 and INT_MAX"); RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderUTF8_Blended_Wrapped(font, text, color, wrap), return_value);
}

PHP_FUNCTION(TTF_RenderUTF8_Shaded)
{
	zval *value, *color_value, *background_value;
	char *text; size_t length;
	SDL_Color color, background;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszz", &value, ttf_font_ce, &text, &length, &color_value, &background_value) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color) || !php_sdl_read_color(background_value, &background)) { RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderUTF8_Shaded(font, text, color, background), return_value);
}

PHP_FUNCTION(TTF_RenderUTF8_Shaded_Wrapped)
{
	zval *value, *color_value, *background_value;
	char *text; size_t length;
	SDL_Color color, background;
	zend_long wrap;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszzl", &value, ttf_font_ce, &text, &length, &color_value, &background_value, &wrap) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color) || !php_sdl_read_color(background_value, &background)) { RETURN_THROWS(); }
	if (wrap < 0 || wrap > INT_MAX) { zend_value_error("wrapLength must be between 0 and INT_MAX"); RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderUTF8_Shaded_Wrapped(font, text, color, background, wrap), return_value);
}

PHP_FUNCTION(TTF_RenderText_Solid_Wrapped)
{
	zval *value, *color_value;
	char *text; size_t length;
	SDL_Color color;
	zend_long wrap;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszl", &value, ttf_font_ce, &text, &length, &color_value, &wrap) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color)) { RETURN_THROWS(); }
	if (wrap < 0 || wrap > INT_MAX) { zend_value_error("wrapLength must be between 0 and INT_MAX"); RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderText_Solid_Wrapped(font, text, color, wrap), return_value);
}

PHP_FUNCTION(TTF_RenderText_Blended_Wrapped)
{
	zval *value, *color_value;
	char *text; size_t length;
	SDL_Color color;
	zend_long wrap;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszl", &value, ttf_font_ce, &text, &length, &color_value, &wrap) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color)) { RETURN_THROWS(); }
	if (wrap < 0 || wrap > INT_MAX) { zend_value_error("wrapLength must be between 0 and INT_MAX"); RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderText_Blended_Wrapped(font, text, color, wrap), return_value);
}

PHP_FUNCTION(TTF_RenderText_Shaded_Wrapped)
{
	zval *value, *color_value, *background_value;
	char *text; size_t length;
	SDL_Color color, background;
	zend_long wrap;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszzl", &value, ttf_font_ce, &text, &length, &color_value, &background_value, &wrap) == FAILURE) { RETURN_THROWS(); }
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	if (!php_sdl_read_color(color_value, &color) || !php_sdl_read_color(background_value, &background)) { RETURN_THROWS(); }
	if (wrap < 0 || wrap > INT_MAX) { zend_value_error("wrapLength must be between 0 and INT_MAX"); RETURN_THROWS(); }
	FONT(value);
	sdl_surface_to_zval(TTF_RenderText_Shaded_Wrapped(font, text, color, background, wrap), return_value);
}

PHP_FUNCTION(TTF_SizeText)
{
	zval *value, *width, *height; char *text; size_t length; int w, h;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszz", &value, ttf_font_ce, &text, &length, &width, &height) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	int result = TTF_SizeText(font, text, &w, &h);
	if (!result) { ZEND_TRY_ASSIGN_REF_LONG(width, w); if (EG(exception)) { RETURN_THROWS(); } ZEND_TRY_ASSIGN_REF_LONG(height, h); if (EG(exception)) { RETURN_THROWS(); } }
	RETURN_LONG(result);
}

PHP_FUNCTION(TTF_SizeUTF8)
{
	zval *value, *width, *height; char *text; size_t length; int w, h;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Oszz", &value, ttf_font_ce, &text, &length, &width, &height) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (!text_valid(text, length)) { RETURN_THROWS(); }
	int result = TTF_SizeUTF8(font, text, &w, &h);
	if (!result) { ZEND_TRY_ASSIGN_REF_LONG(width, w); if (EG(exception)) { RETURN_THROWS(); } ZEND_TRY_ASSIGN_REF_LONG(height, h); if (EG(exception)) { RETURN_THROWS(); } }
	RETURN_LONG(result);
}

static zend_bool codepoint_valid(zend_long codepoint, zend_long maximum)
{
	if (codepoint < 0 || codepoint > maximum || (codepoint >= 0xd800 && codepoint <= 0xdfff)) {
		zend_value_error("glyph must be a Unicode scalar in the supported range"); return 0;
	}
	return 1;
}

PHP_FUNCTION(TTF_GlyphMetrics)
{
	zval *value, *min_x, *max_x, *min_y, *max_y, *advance; zend_long codepoint;
	int a, b, c, d, e;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Olzzzzz", &value, ttf_font_ce, &codepoint, &min_x, &max_x, &min_y, &max_y, &advance) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (!codepoint_valid(codepoint, 65535)) { RETURN_THROWS(); }
	int result = TTF_GlyphMetrics(font, codepoint, &a, &b, &c, &d, &e);
	if (!result) {
		ZEND_TRY_ASSIGN_REF_LONG(min_x, a); if (EG(exception)) { RETURN_THROWS(); } ZEND_TRY_ASSIGN_REF_LONG(max_x, b); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(min_y, c); if (EG(exception)) { RETURN_THROWS(); } ZEND_TRY_ASSIGN_REF_LONG(max_y, d); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(advance, e); if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}

PHP_FUNCTION(TTF_GlyphIsProvided)
{
	zval *value; zend_long codepoint;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &codepoint) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (!codepoint_valid(codepoint, 65535)) { RETURN_THROWS(); }
	RETURN_LONG(TTF_GlyphIsProvided(font, codepoint));
}

PHP_FUNCTION(TTF_GlyphMetrics32)
{
	zval *value, *min_x, *max_x, *min_y, *max_y, *advance; zend_long codepoint;
	int a, b, c, d, e;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Olzzzzz", &value, ttf_font_ce, &codepoint, &min_x, &max_x, &min_y, &max_y, &advance) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (!codepoint_valid(codepoint, 1114111)) { RETURN_THROWS(); }
	int result = TTF_GlyphMetrics32(font, codepoint, &a, &b, &c, &d, &e);
	if (!result) {
		ZEND_TRY_ASSIGN_REF_LONG(min_x, a); if (EG(exception)) { RETURN_THROWS(); } ZEND_TRY_ASSIGN_REF_LONG(max_x, b); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(min_y, c); if (EG(exception)) { RETURN_THROWS(); } ZEND_TRY_ASSIGN_REF_LONG(max_y, d); if (EG(exception)) { RETURN_THROWS(); }
		ZEND_TRY_ASSIGN_REF_LONG(advance, e); if (EG(exception)) { RETURN_THROWS(); }
	}
	RETURN_LONG(result);
}

PHP_FUNCTION(TTF_GlyphIsProvided32)
{
	zval *value; zend_long codepoint;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &codepoint) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (!codepoint_valid(codepoint, 1114111)) { RETURN_THROWS(); }
	RETURN_LONG(TTF_GlyphIsProvided32(font, codepoint));
}

#define FONT_GET(name) PHP_FUNCTION(name) \
{ zval *value; if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ttf_font_ce) == FAILURE) { RETURN_THROWS(); } \
	FONT(value); RETURN_LONG(name(font)); }
FONT_GET(TTF_FontHeight)
FONT_GET(TTF_FontAscent)
FONT_GET(TTF_FontDescent)
FONT_GET(TTF_FontLineSkip)
FONT_GET(TTF_GetFontStyle)
FONT_GET(TTF_GetFontOutline)
FONT_GET(TTF_GetFontHinting)
FONT_GET(TTF_GetFontKerning)
FONT_GET(TTF_FontFaces)
FONT_GET(TTF_FontFaceIsFixedWidth)

PHP_FUNCTION(TTF_SetFontStyle)
{
	zval *value; zend_long setting;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &setting) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (setting < 0 || setting > 15) { zend_value_error("font style is out of range"); RETURN_THROWS(); }
	TTF_SetFontStyle(font, setting);
}

PHP_FUNCTION(TTF_SetFontOutline)
{
	zval *value; zend_long setting;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &setting) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (setting < 0 || setting > 4096) { zend_value_error("font outline is out of range"); RETURN_THROWS(); }
	TTF_SetFontOutline(font, setting);
}

PHP_FUNCTION(TTF_SetFontHinting)
{
	zval *value; zend_long setting;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &setting) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (setting < 0 || setting > 4) { zend_value_error("font hinting is out of range"); RETURN_THROWS(); }
	TTF_SetFontHinting(font, setting);
}

PHP_FUNCTION(TTF_SetFontKerning)
{
	zval *value; zend_long setting;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &setting) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (setting < 0 || setting > 1) { zend_value_error("font kerning is out of range"); RETURN_THROWS(); }
	TTF_SetFontKerning(font, setting);
}

PHP_FUNCTION(TTF_SetFontSize)
{
	zval *value; zend_long setting;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ttf_font_ce, &setting) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	if (setting < 1 || setting > 4096) { zend_value_error("font size is out of range"); RETURN_THROWS(); }
	RETURN_LONG(TTF_SetFontSize(font, setting));
}

PHP_FUNCTION(TTF_FontFaceFamilyName)
{
	zval *value;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ttf_font_ce) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	const char *name = TTF_FontFaceFamilyName(font);
	if (!name) { RETURN_NULL(); }
	RETURN_STRING(name);
}

PHP_FUNCTION(TTF_FontFaceStyleName)
{
	zval *value;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ttf_font_ce) == FAILURE) { RETURN_THROWS(); }
	FONT(value);
	const char *name = TTF_FontFaceStyleName(font);
	if (!name) { RETURN_NULL(); }
	RETURN_STRING(name);
}

int php_ttf_extra_minit(INIT_FUNC_ARGS)
{
#define CONSTANT(name) REGISTER_LONG_CONSTANT(#name, name, CONST_CS | CONST_PERSISTENT)
	CONSTANT(TTF_STYLE_NORMAL); CONSTANT(TTF_STYLE_BOLD); CONSTANT(TTF_STYLE_ITALIC);
	CONSTANT(TTF_STYLE_UNDERLINE); CONSTANT(TTF_STYLE_STRIKETHROUGH);
	CONSTANT(TTF_HINTING_NORMAL); CONSTANT(TTF_HINTING_LIGHT); CONSTANT(TTF_HINTING_MONO);
	CONSTANT(TTF_HINTING_NONE); CONSTANT(TTF_HINTING_LIGHT_SUBPIXEL);
	return zend_register_functions(NULL, ext_functions, NULL, MODULE_PERSISTENT);
}
