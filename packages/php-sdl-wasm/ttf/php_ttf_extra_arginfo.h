/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: 5a0c8df6085681b068e59799f94fa7581850c1c5 */

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_TTF_RenderUTF8_Solid, 0, 3, SDL_Surface, 1)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, color, SDL_Color, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_TTF_RenderUTF8_Solid_Wrapped, 0, 4, SDL_Surface, 1)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, color, SDL_Color, 0)
	ZEND_ARG_TYPE_INFO(0, wrapLength, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_TTF_RenderUTF8_Blended arginfo_TTF_RenderUTF8_Solid

#define arginfo_TTF_RenderUTF8_Blended_Wrapped arginfo_TTF_RenderUTF8_Solid_Wrapped

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_TTF_RenderUTF8_Shaded, 0, 4, SDL_Surface, 1)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, color, SDL_Color, 0)
	ZEND_ARG_OBJ_INFO(0, background, SDL_Color, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_TTF_RenderUTF8_Shaded_Wrapped, 0, 5, SDL_Surface, 1)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, color, SDL_Color, 0)
	ZEND_ARG_OBJ_INFO(0, background, SDL_Color, 0)
	ZEND_ARG_TYPE_INFO(0, wrapLength, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_TTF_RenderText_Solid_Wrapped arginfo_TTF_RenderUTF8_Solid_Wrapped

#define arginfo_TTF_RenderText_Blended_Wrapped arginfo_TTF_RenderUTF8_Solid_Wrapped

#define arginfo_TTF_RenderText_Shaded_Wrapped arginfo_TTF_RenderUTF8_Shaded_Wrapped

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_SizeText, 0, 4, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(1, width, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, height, IS_LONG, 1)
ZEND_END_ARG_INFO()

#define arginfo_TTF_SizeUTF8 arginfo_TTF_SizeText

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_GlyphMetrics, 0, 7, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, codepoint, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, minX, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, maxX, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, minY, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, maxY, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, advance, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_GlyphIsProvided, 0, 2, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, codepoint, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_TTF_GlyphMetrics32 arginfo_TTF_GlyphMetrics

#define arginfo_TTF_GlyphIsProvided32 arginfo_TTF_GlyphIsProvided

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_FontHeight, 0, 1, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
ZEND_END_ARG_INFO()

#define arginfo_TTF_FontAscent arginfo_TTF_FontHeight

#define arginfo_TTF_FontDescent arginfo_TTF_FontHeight

#define arginfo_TTF_FontLineSkip arginfo_TTF_FontHeight

#define arginfo_TTF_GetFontStyle arginfo_TTF_FontHeight

#define arginfo_TTF_GetFontOutline arginfo_TTF_FontHeight

#define arginfo_TTF_GetFontHinting arginfo_TTF_FontHeight

#define arginfo_TTF_GetFontKerning arginfo_TTF_FontHeight

#define arginfo_TTF_FontFaces arginfo_TTF_FontHeight

#define arginfo_TTF_FontFaceIsFixedWidth arginfo_TTF_FontHeight

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_SetFontStyle, 0, 2, IS_VOID, 0)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_TTF_SetFontOutline arginfo_TTF_SetFontStyle

#define arginfo_TTF_SetFontHinting arginfo_TTF_SetFontStyle

#define arginfo_TTF_SetFontKerning arginfo_TTF_SetFontStyle

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_SetFontSize, 0, 2, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_TTF_FontFaceFamilyName, 0, 1, IS_STRING, 1)
	ZEND_ARG_OBJ_INFO(0, font, TTF_Font, 0)
ZEND_END_ARG_INFO()

#define arginfo_TTF_FontFaceStyleName arginfo_TTF_FontFaceFamilyName


ZEND_FUNCTION(TTF_RenderUTF8_Solid);
ZEND_FUNCTION(TTF_RenderUTF8_Solid_Wrapped);
ZEND_FUNCTION(TTF_RenderUTF8_Blended);
ZEND_FUNCTION(TTF_RenderUTF8_Blended_Wrapped);
ZEND_FUNCTION(TTF_RenderUTF8_Shaded);
ZEND_FUNCTION(TTF_RenderUTF8_Shaded_Wrapped);
ZEND_FUNCTION(TTF_RenderText_Solid_Wrapped);
ZEND_FUNCTION(TTF_RenderText_Blended_Wrapped);
ZEND_FUNCTION(TTF_RenderText_Shaded_Wrapped);
ZEND_FUNCTION(TTF_SizeText);
ZEND_FUNCTION(TTF_SizeUTF8);
ZEND_FUNCTION(TTF_GlyphMetrics);
ZEND_FUNCTION(TTF_GlyphIsProvided);
ZEND_FUNCTION(TTF_GlyphMetrics32);
ZEND_FUNCTION(TTF_GlyphIsProvided32);
ZEND_FUNCTION(TTF_FontHeight);
ZEND_FUNCTION(TTF_FontAscent);
ZEND_FUNCTION(TTF_FontDescent);
ZEND_FUNCTION(TTF_FontLineSkip);
ZEND_FUNCTION(TTF_GetFontStyle);
ZEND_FUNCTION(TTF_GetFontOutline);
ZEND_FUNCTION(TTF_GetFontHinting);
ZEND_FUNCTION(TTF_GetFontKerning);
ZEND_FUNCTION(TTF_FontFaces);
ZEND_FUNCTION(TTF_FontFaceIsFixedWidth);
ZEND_FUNCTION(TTF_SetFontStyle);
ZEND_FUNCTION(TTF_SetFontOutline);
ZEND_FUNCTION(TTF_SetFontHinting);
ZEND_FUNCTION(TTF_SetFontKerning);
ZEND_FUNCTION(TTF_SetFontSize);
ZEND_FUNCTION(TTF_FontFaceFamilyName);
ZEND_FUNCTION(TTF_FontFaceStyleName);


static const zend_function_entry ext_functions[] = {
	ZEND_FE(TTF_RenderUTF8_Solid, arginfo_TTF_RenderUTF8_Solid)
	ZEND_FE(TTF_RenderUTF8_Solid_Wrapped, arginfo_TTF_RenderUTF8_Solid_Wrapped)
	ZEND_FE(TTF_RenderUTF8_Blended, arginfo_TTF_RenderUTF8_Blended)
	ZEND_FE(TTF_RenderUTF8_Blended_Wrapped, arginfo_TTF_RenderUTF8_Blended_Wrapped)
	ZEND_FE(TTF_RenderUTF8_Shaded, arginfo_TTF_RenderUTF8_Shaded)
	ZEND_FE(TTF_RenderUTF8_Shaded_Wrapped, arginfo_TTF_RenderUTF8_Shaded_Wrapped)
	ZEND_FE(TTF_RenderText_Solid_Wrapped, arginfo_TTF_RenderText_Solid_Wrapped)
	ZEND_FE(TTF_RenderText_Blended_Wrapped, arginfo_TTF_RenderText_Blended_Wrapped)
	ZEND_FE(TTF_RenderText_Shaded_Wrapped, arginfo_TTF_RenderText_Shaded_Wrapped)
	ZEND_FE(TTF_SizeText, arginfo_TTF_SizeText)
	ZEND_FE(TTF_SizeUTF8, arginfo_TTF_SizeUTF8)
	ZEND_FE(TTF_GlyphMetrics, arginfo_TTF_GlyphMetrics)
	ZEND_FE(TTF_GlyphIsProvided, arginfo_TTF_GlyphIsProvided)
	ZEND_FE(TTF_GlyphMetrics32, arginfo_TTF_GlyphMetrics32)
	ZEND_FE(TTF_GlyphIsProvided32, arginfo_TTF_GlyphIsProvided32)
	ZEND_FE(TTF_FontHeight, arginfo_TTF_FontHeight)
	ZEND_FE(TTF_FontAscent, arginfo_TTF_FontAscent)
	ZEND_FE(TTF_FontDescent, arginfo_TTF_FontDescent)
	ZEND_FE(TTF_FontLineSkip, arginfo_TTF_FontLineSkip)
	ZEND_FE(TTF_GetFontStyle, arginfo_TTF_GetFontStyle)
	ZEND_FE(TTF_GetFontOutline, arginfo_TTF_GetFontOutline)
	ZEND_FE(TTF_GetFontHinting, arginfo_TTF_GetFontHinting)
	ZEND_FE(TTF_GetFontKerning, arginfo_TTF_GetFontKerning)
	ZEND_FE(TTF_FontFaces, arginfo_TTF_FontFaces)
	ZEND_FE(TTF_FontFaceIsFixedWidth, arginfo_TTF_FontFaceIsFixedWidth)
	ZEND_FE(TTF_SetFontStyle, arginfo_TTF_SetFontStyle)
	ZEND_FE(TTF_SetFontOutline, arginfo_TTF_SetFontOutline)
	ZEND_FE(TTF_SetFontHinting, arginfo_TTF_SetFontHinting)
	ZEND_FE(TTF_SetFontKerning, arginfo_TTF_SetFontKerning)
	ZEND_FE(TTF_SetFontSize, arginfo_TTF_SetFontSize)
	ZEND_FE(TTF_FontFaceFamilyName, arginfo_TTF_FontFaceFamilyName)
	ZEND_FE(TTF_FontFaceStyleName, arginfo_TTF_FontFaceStyleName)
	ZEND_FE_END
};
