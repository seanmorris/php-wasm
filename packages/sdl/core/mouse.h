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


#ifndef PHP_SDL_MOUSE_H
#define PHP_SDL_MOUSE_H

#ifdef  __cplusplus
extern "C" {
#endif

#include "php_sdl.h"

zend_class_entry *get_php_sdl_cursor_ce(void);
zend_bool sdl_cursor_to_zval(SDL_Cursor *cursor, zval *z_val, Uint32 flags);
SDL_Cursor *zval_to_sdl_cursor(zval *z_val);

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_CreateSystemCursor, 0, 0, 1)
       ZEND_ARG_INFO(0, id)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_CreateColorCursor, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, surface, SDL_Surface, 0)
       ZEND_ARG_INFO(0, hot_x)
       ZEND_ARG_INFO(0, hot_y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_ShowCursor, 0, 0, 1)
       ZEND_ARG_INFO(0, toggle)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GetMouseState, 0, 0, 0)
       ZEND_ARG_INFO(1, x)
       ZEND_ARG_INFO(1, y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_WarpMouseInWindow, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 1)
       ZEND_ARG_INFO(0, x)
       ZEND_ARG_INFO(0, y)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetRelativeMouseMode, 0, 0, 1)
       ZEND_ARG_INFO(0, enabled)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Cursor, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, cursor, SDL_Cursor, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_SetCursor, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, cursor, SDL_Cursor, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_Cursor__construct, 0, 0, 6)
       ZEND_ARG_INFO(0, data)
       ZEND_ARG_INFO(0, mask)
       ZEND_ARG_INFO(0, w)
       ZEND_ARG_INFO(0, h)
       ZEND_ARG_INFO(0, hot_x)
       ZEND_ARG_INFO(0, hot_y)
ZEND_END_ARG_INFO()

PHP_FUNCTION(SDL_CreateCursor);
PHP_FUNCTION(SDL_CreateSystemCursor);
PHP_FUNCTION(SDL_CreateColorCursor);
PHP_FUNCTION(SDL_FreeCursor);
PHP_FUNCTION(SDL_SetCursor);
PHP_FUNCTION(SDL_GetCursor);
PHP_FUNCTION(SDL_GetDefaultCursor);
PHP_FUNCTION(SDL_ShowCursor);
PHP_FUNCTION(SDL_GetMouseFocus);
PHP_FUNCTION(SDL_GetMouseState);
PHP_FUNCTION(SDL_GetRelativeMouseState);
PHP_FUNCTION(SDL_WarpMouseInWindow);
PHP_FUNCTION(SDL_SetRelativeMouseMode);
PHP_FUNCTION(SDL_GetRelativeMouseMode);

PHP_MINIT_FUNCTION(sdl_mouse);

#ifdef  __cplusplus
} // extern "C"
#endif

#endif /* PHP_SDL_MOUSE_H */
