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


#ifndef PHP_SDL_GLCONTEXT_H
#define PHP_SDL_GLCONTEXT_H

#ifdef  __cplusplus
extern "C" {
#endif

zend_class_entry *get_php_sdl_glcontext_ce(void);
zend_bool  sdl_glcontext_to_zval(SDL_GLContext glcontext, zval *z_val, Uint32 flags);
SDL_GLContext zval_to_sdl_glcontext(zval *z_val);

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GLContext, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, GLcontext, SDL_GLContext, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_DeleteContext, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, GLcontext, SDL_GLContext, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_ExtensionSupported, 0, 0, 1)
       ZEND_ARG_INFO(0, extension)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_SetAttribute, 0, 0, 2)
       ZEND_ARG_INFO(0, attr)
       ZEND_ARG_INFO(0, value)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_GetAttribute, 0, 0, 2)
       ZEND_ARG_INFO(0, attr)
       ZEND_ARG_INFO(1, value)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GLContext__construct, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_MakeCurrent, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 1)
       ZEND_ARG_OBJ_INFO(0, context, SDL_GLContext, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_GetDrawableSize, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, window, SDL_Window, 0)
       ZEND_ARG_INFO(1, w)
       ZEND_ARG_INFO(1, h)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_GL_SetSwapInterval, 0, 0, 1)
       ZEND_ARG_INFO(0, interval)
ZEND_END_ARG_INFO()

/* generic arginfo */

ZEND_BEGIN_ARG_INFO_EX(arginfo_none, 0, 0, 0)
ZEND_END_ARG_INFO()


PHP_FUNCTION(SDL_GL_CreateContext);
PHP_FUNCTION(SDL_GL_MakeCurrent);
PHP_FUNCTION(SDL_GL_GetCurrentWindow);
#if SDL_VERSION_ATLEAST(2,0,1)
PHP_FUNCTION(SDL_GL_GetDrawableSize);
#endif
PHP_FUNCTION(SDL_GL_SwapWindow);

PHP_FUNCTION(SDL_GL_ExtensionSupported);
PHP_FUNCTION(SDL_GL_SetAttribute);
PHP_FUNCTION(SDL_GL_GetAttribute);
PHP_FUNCTION(SDL_GL_DeleteContext);
PHP_FUNCTION(SDL_GL_GetCurrentContext);
PHP_FUNCTION(SDL_GL_SetSwapInterval);
PHP_FUNCTION(SDL_GL_GetSwapInterval);
PHP_MINIT_FUNCTION(sdl_glcontext);

#ifdef  __cplusplus
} // extern "C"
#endif

#endif /* PHP_SDL_GLCONTEXT_H */
