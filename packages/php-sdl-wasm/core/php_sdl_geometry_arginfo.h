/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: e33626310e7072837ad3fd88bd33574d45ccd008 */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderGeometry, 0, 3, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(0, vertices, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, indices, IS_ARRAY, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderGeometryRaw, 0, 9, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(0, xy, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, xyStride, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, colors, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, colorStride, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, uv, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, uvStride, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, vertexCount, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, indices, IS_STRING, 1, "null")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, indexCount, IS_LONG, 0, "0")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, indexSize, IS_LONG, 0, "4")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderDrawPoints, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, points, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_RenderDrawLines arginfo_SDL_RenderDrawPoints

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderDrawRects, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, rectangles, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_RenderFillRects arginfo_SDL_RenderDrawRects

#define arginfo_SDL_RenderDrawPointsF arginfo_SDL_RenderDrawPoints

#define arginfo_SDL_RenderDrawLinesF arginfo_SDL_RenderDrawPoints

#define arginfo_SDL_RenderDrawRectsF arginfo_SDL_RenderDrawRects

#define arginfo_SDL_RenderFillRectsF arginfo_SDL_RenderDrawRects

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetNumRenderDrivers, 0, 0, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetRenderDriverInfo, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, info, IS_ARRAY, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetRendererInfo, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(1, info, IS_ARRAY, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderTargetSupported, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_INFO(0, renderer)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetRenderDrawColor, 0, 5, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(1, red, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, green, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, blue, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, alpha, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_SetRenderDrawBlendMode, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetRenderDrawBlendMode, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(1, mode, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderSetViewport, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_OBJ_INFO(0, rect, SDL_Rect, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderGetViewport, 0, 2, IS_VOID, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_OBJ_INFO(1, rect, SDL_Rect, 1)
ZEND_END_ARG_INFO()

#define arginfo_SDL_RenderSetClipRect arginfo_SDL_RenderSetViewport

#define arginfo_SDL_RenderGetClipRect arginfo_SDL_RenderGetViewport

#define arginfo_SDL_RenderIsClipEnabled arginfo_SDL_RenderTargetSupported

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderSetLogicalSize, 0, 3, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, width, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, height, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderGetLogicalSize, 0, 3, IS_VOID, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(1, width, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, height, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderSetIntegerScale, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, enabled, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_RenderGetIntegerScale arginfo_SDL_RenderTargetSupported

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderSetScale, 0, 3, IS_LONG, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, x, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, y, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderGetScale, 0, 3, IS_VOID, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(1, x, IS_DOUBLE, 1)
	ZEND_ARG_TYPE_INFO(1, y, IS_DOUBLE, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderWindowToLogical, 0, 5, IS_VOID, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, windowX, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, windowY, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(1, logicalX, IS_DOUBLE, 1)
	ZEND_ARG_TYPE_INFO(1, logicalY, IS_DOUBLE, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderLogicalToWindow, 0, 5, IS_VOID, 0)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_TYPE_INFO(0, logicalX, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, logicalY, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(1, windowX, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, windowY, IS_LONG, 1)
ZEND_END_ARG_INFO()


ZEND_FUNCTION(SDL_RenderGeometry);
ZEND_FUNCTION(SDL_RenderGeometryRaw);
ZEND_FUNCTION(SDL_RenderDrawPoints);
ZEND_FUNCTION(SDL_RenderDrawLines);
ZEND_FUNCTION(SDL_RenderDrawRects);
ZEND_FUNCTION(SDL_RenderFillRects);
ZEND_FUNCTION(SDL_RenderDrawPointsF);
ZEND_FUNCTION(SDL_RenderDrawLinesF);
ZEND_FUNCTION(SDL_RenderDrawRectsF);
ZEND_FUNCTION(SDL_RenderFillRectsF);
ZEND_FUNCTION(SDL_GetNumRenderDrivers);
ZEND_FUNCTION(SDL_GetRenderDriverInfo);
ZEND_FUNCTION(SDL_GetRendererInfo);
ZEND_FUNCTION(SDL_RenderTargetSupported);
ZEND_FUNCTION(SDL_GetRenderDrawColor);
ZEND_FUNCTION(SDL_SetRenderDrawBlendMode);
ZEND_FUNCTION(SDL_GetRenderDrawBlendMode);
ZEND_FUNCTION(SDL_RenderSetViewport);
ZEND_FUNCTION(SDL_RenderGetViewport);
ZEND_FUNCTION(SDL_RenderSetClipRect);
ZEND_FUNCTION(SDL_RenderGetClipRect);
ZEND_FUNCTION(SDL_RenderIsClipEnabled);
ZEND_FUNCTION(SDL_RenderSetLogicalSize);
ZEND_FUNCTION(SDL_RenderGetLogicalSize);
ZEND_FUNCTION(SDL_RenderSetIntegerScale);
ZEND_FUNCTION(SDL_RenderGetIntegerScale);
ZEND_FUNCTION(SDL_RenderSetScale);
ZEND_FUNCTION(SDL_RenderGetScale);
ZEND_FUNCTION(SDL_RenderWindowToLogical);
ZEND_FUNCTION(SDL_RenderLogicalToWindow);


static const zend_function_entry ext_functions[] = {
	ZEND_FE(SDL_RenderGeometry, arginfo_SDL_RenderGeometry)
	ZEND_FE(SDL_RenderGeometryRaw, arginfo_SDL_RenderGeometryRaw)
	ZEND_FE(SDL_RenderDrawPoints, arginfo_SDL_RenderDrawPoints)
	ZEND_FE(SDL_RenderDrawLines, arginfo_SDL_RenderDrawLines)
	ZEND_FE(SDL_RenderDrawRects, arginfo_SDL_RenderDrawRects)
	ZEND_FE(SDL_RenderFillRects, arginfo_SDL_RenderFillRects)
	ZEND_FE(SDL_RenderDrawPointsF, arginfo_SDL_RenderDrawPointsF)
	ZEND_FE(SDL_RenderDrawLinesF, arginfo_SDL_RenderDrawLinesF)
	ZEND_FE(SDL_RenderDrawRectsF, arginfo_SDL_RenderDrawRectsF)
	ZEND_FE(SDL_RenderFillRectsF, arginfo_SDL_RenderFillRectsF)
	ZEND_FE(SDL_GetNumRenderDrivers, arginfo_SDL_GetNumRenderDrivers)
	ZEND_FE(SDL_GetRenderDriverInfo, arginfo_SDL_GetRenderDriverInfo)
	ZEND_FE(SDL_GetRendererInfo, arginfo_SDL_GetRendererInfo)
	ZEND_FE(SDL_RenderTargetSupported, arginfo_SDL_RenderTargetSupported)
	ZEND_FE(SDL_GetRenderDrawColor, arginfo_SDL_GetRenderDrawColor)
	ZEND_FE(SDL_SetRenderDrawBlendMode, arginfo_SDL_SetRenderDrawBlendMode)
	ZEND_FE(SDL_GetRenderDrawBlendMode, arginfo_SDL_GetRenderDrawBlendMode)
	ZEND_FE(SDL_RenderSetViewport, arginfo_SDL_RenderSetViewport)
	ZEND_FE(SDL_RenderGetViewport, arginfo_SDL_RenderGetViewport)
	ZEND_FE(SDL_RenderSetClipRect, arginfo_SDL_RenderSetClipRect)
	ZEND_FE(SDL_RenderGetClipRect, arginfo_SDL_RenderGetClipRect)
	ZEND_FE(SDL_RenderIsClipEnabled, arginfo_SDL_RenderIsClipEnabled)
	ZEND_FE(SDL_RenderSetLogicalSize, arginfo_SDL_RenderSetLogicalSize)
	ZEND_FE(SDL_RenderGetLogicalSize, arginfo_SDL_RenderGetLogicalSize)
	ZEND_FE(SDL_RenderSetIntegerScale, arginfo_SDL_RenderSetIntegerScale)
	ZEND_FE(SDL_RenderGetIntegerScale, arginfo_SDL_RenderGetIntegerScale)
	ZEND_FE(SDL_RenderSetScale, arginfo_SDL_RenderSetScale)
	ZEND_FE(SDL_RenderGetScale, arginfo_SDL_RenderGetScale)
	ZEND_FE(SDL_RenderWindowToLogical, arginfo_SDL_RenderWindowToLogical)
	ZEND_FE(SDL_RenderLogicalToWindow, arginfo_SDL_RenderLogicalToWindow)
	ZEND_FE_END
};
