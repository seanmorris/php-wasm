/*
  +----------------------------------------------------------------------+
  | Copyright (c) 1997-2018 The PHP Group                                |
  +----------------------------------------------------------------------+
  | This source file is subject to version 3.01 of the PHP license,      |
  | that is bundled with this package in the file LICENSE, and is        |
  | available through the world-wide-web at the following url:           |
  | http://www.php.net/license/3_01.txt                                  |
  | If you did not receive a copy of the PHP license and are unable to   |
  | obtain it through the world-wide-web, please send a note to          |
  | license@php.net so we can mail you a copy immediately.               |
  +----------------------------------------------------------------------+
  | Authors: Santiago Lizardo <santiagolizardo@php.net>                  |
  |          Remi Collet <remi@php.net>                                  |
  +----------------------------------------------------------------------+
*/


#ifndef PHP_SDL_WINDOW_H
#define PHP_SDL_WINDOW_H

#ifdef  __cplusplus
extern "C" {
#endif

#include "php_sdl.h"

zend_class_entry *get_php_sdl_window_ce(void);
zend_bool sdl_window_to_zval(SDL_Window *window, zval *z_val, int flags);
SDL_Window *zval_to_sdl_window(zval *z_val);

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowDisplayMode, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_OBJ_INFO(0, displaymode, SDL_DisplayMode, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetDisplayMode, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, displaymode, SDL_DisplayMode, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GetWindowDisplayMode, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(1, displaymode)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_GetDisplayMode, 0, 0, 1)
       ZEND_ARG_INFO(1, displaymode)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowIcon, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_OBJ_INFO(0, icon, SDL_Surface, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetIcon, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, icon, SDL_Surface, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowData, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, name)
       ZEND_ARG_INFO(0, value)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetData, 0, 0, 2)
       ZEND_ARG_INFO(0, name)
       ZEND_ARG_INFO(0, value)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_GetData, 0, 0, 1)
       ZEND_ARG_INFO(0, name)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowPosition, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, x)
       ZEND_ARG_INFO(0, y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetPosition, 0, 0, 2)
       ZEND_ARG_INFO(0, x)
       ZEND_ARG_INFO(0, y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetSize, 0, 0, 2)
       ZEND_ARG_INFO(0, w)
       ZEND_ARG_INFO(0, h)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_WINDOWPOS_DISPLAY, 0, 0, 1)
       ZEND_ARG_INFO(0, display)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GetWindowPosition, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(1, x)
       ZEND_ARG_INFO(1, y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_GetSize, 0, 0, 0)
       ZEND_ARG_INFO(1, w)
       ZEND_ARG_INFO(1, h)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_GetPosition, 0, 0, 0)
       ZEND_ARG_INFO(1, x)
       ZEND_ARG_INFO(1, y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowBordered, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, bordered)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetBordered, 0, 0, 1)
       ZEND_ARG_INFO(0, bordered)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowFullscreen, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, flags)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetFullscreen, 0, 0, 1)
       ZEND_ARG_INFO(0, flags)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_UpdateWindowSurfaceRects, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_ARRAY_INFO(0, rects, 0)
       ZEND_ARG_INFO(0, numrect)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_UpdateSurfaceRects, 0, 0, 1)
       ZEND_ARG_ARRAY_INFO(0, rects, 0)
       ZEND_ARG_INFO(0, numrect)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowGrab, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, grabbed)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetGrab, 0, 0, 1)
       ZEND_ARG_INFO(0, grabbed)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowBrightness, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, brightness)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetBrightness, 0, 0, 1)
       ZEND_ARG_INFO(0, brightness)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetGammaRamp, 0, 0, 3)
       ZEND_ARG_ARRAY_INFO(0, red, 0)
       ZEND_ARG_ARRAY_INFO(0, green, 0)
       ZEND_ARG_ARRAY_INFO(0, blue, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GetWindowGammaRamp, 0, 0, 4)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(1, red)
       ZEND_ARG_INFO(1, green)
       ZEND_ARG_INFO(1, blue)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_GetGammaRamp, 0, 0, 3)
       ZEND_ARG_INFO(1, red)
       ZEND_ARG_INFO(1, green)
       ZEND_ARG_INFO(1, blue)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_CreateWindow, 0, 0, 6)
       ZEND_ARG_INFO(0, title)
       ZEND_ARG_INFO(0, x)
       ZEND_ARG_INFO(0, y)
       ZEND_ARG_INFO(0, w)
       ZEND_ARG_INFO(0, h)
       ZEND_ARG_INFO(0, flags)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowTitle, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(0, title)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetTitle, 0, 0, 1)
       ZEND_ARG_INFO(0, title)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetWindowShape, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, window,  SDL_Window, 0)
       ZEND_ARG_OBJ_INFO(0, surface, SDL_Surface, 0)
       ZEND_ARG_OBJ_INFO(0, mode,    SDL_WindowShapeMode, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_SetShape, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, surface, SDL_Surface, 0)
       ZEND_ARG_OBJ_INFO(0, mode,    SDL_WindowShapeMode, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GetShapedWindowMode, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window,  SDL_Window, 0)
       ZEND_ARG_INFO(1, shaped_mode)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window_GetShapedMode, 0, 0, 1)
       ZEND_ARG_INFO(1, shaped_mode)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_window_none, 0, 0, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Window, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
ZEND_END_ARG_INFO()

PHP_FUNCTION(SDL_GetWindowDisplayIndex);
PHP_FUNCTION(SDL_SetWindowDisplayMode);
PHP_FUNCTION(SDL_GetWindowDisplayMode);
PHP_FUNCTION(SDL_GetWindowPixelFormat);
PHP_FUNCTION(SDL_GetWindowID);
PHP_FUNCTION(SDL_GetWindowFromID);
PHP_FUNCTION(SDL_GetWindowFlags);
PHP_FUNCTION(SDL_SetWindowIcon);
PHP_FUNCTION(SDL_WINDOWPOS_CENTERED_DISPLAY);
PHP_FUNCTION(SDL_WINDOWPOS_UNDEFINED_DISPLAY);
PHP_FUNCTION(SDL_SetWindowPosition);
PHP_FUNCTION(SDL_GetWindowPosition);
PHP_FUNCTION(SDL_SetWindowSize);
PHP_FUNCTION(SDL_GetWindowSize);
PHP_FUNCTION(SDL_SetWindowMinimumSize);
PHP_FUNCTION(SDL_GetWindowMinimumSize);
PHP_FUNCTION(SDL_SetWindowMaximumSize);
PHP_FUNCTION(SDL_GetWindowMaximumSize);
PHP_FUNCTION(SDL_SetWindowBordered);
PHP_FUNCTION(SDL_ShowWindow);
PHP_FUNCTION(SDL_HideWindow);
PHP_FUNCTION(SDL_RaiseWindow);
PHP_FUNCTION(SDL_MaximizeWindow);
PHP_FUNCTION(SDL_MinimizeWindow);
PHP_FUNCTION(SDL_RestoreWindow);
PHP_FUNCTION(SDL_SetWindowFullscreen);
PHP_FUNCTION(SDL_GetWindowSurface);
PHP_FUNCTION(SDL_UpdateWindowSurfaceRects);
PHP_FUNCTION(SDL_SetWindowGrab);
PHP_FUNCTION(SDL_GetWindowGrab);
PHP_FUNCTION(SDL_SetWindowBrightness);
PHP_FUNCTION(SDL_GetWindowBrightness);
PHP_FUNCTION(SDL_GetWindowGammaRamp);
PHP_FUNCTION(SDL_CreateShapedWindow);
PHP_FUNCTION(SDL_CreateWindow);
PHP_FUNCTION(SDL_UpdateWindowSurface);
PHP_FUNCTION(SDL_DestroyWindow);
PHP_FUNCTION(SDL_GetWindowTitle);
PHP_FUNCTION(SDL_SetWindowTitle);
PHP_FUNCTION(SDL_IsShapedWindow);
PHP_FUNCTION(SDL_SetWindowShape);
PHP_FUNCTION(SDL_GetShapedWindowMode);

PHP_MINIT_FUNCTION(sdl_window);

#ifdef  __cplusplus
} // extern "C"
#endif

#endif /* PHP_SDL_WINDOW_H */
