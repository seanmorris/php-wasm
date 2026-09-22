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


#ifndef PHP_SDL_RWOPS_H
#define PHP_SDL_RWOPS_H

#ifdef  __cplusplus
extern "C" {
#endif

#include "php_sdl.h"

zend_class_entry *get_php_sdl_rwops_ce(void);
zend_bool  sdl_rwops_to_zval(SDL_RWops *rwops, zval *z_val, Uint32 flags, char *buf);
SDL_RWops *zval_to_sdl_rwops(zval *z_val);
int php_sdl_rwops_close(zval *value);
void php_sdl_rwops_flush(zval *value);
void php_stream_to_zval_rwops(php_stream *stream, zval *return_value, int autoclose);

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWFromFile, 0, 0, 2)
       ZEND_ARG_INFO(0, path)
       ZEND_ARG_INFO(0, mode)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWFromConstMem, 0, 0, 1)
       ZEND_ARG_INFO(0, buf)
       ZEND_ARG_INFO(0, size)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWFromMem, 0, 0, 2)
       ZEND_ARG_INFO(1, buf)
       ZEND_ARG_INFO(0, size)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWFromFP, 0, 0, 1)
       ZEND_ARG_INFO(0, fp)
       ZEND_ARG_INFO(0, autoclose)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWseek, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, RWops, SDL_RWops, 0)
       ZEND_ARG_INFO(0, offset)
       ZEND_ARG_INFO(0, whence)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWops_seek, 0, 0, 2)
       ZEND_ARG_INFO(0, offset)
       ZEND_ARG_INFO(0, whence)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWread, 0, 0, 3)
       ZEND_ARG_OBJ_INFO(0, RWops, SDL_RWops, 0)
       ZEND_ARG_INFO(1, buffer)
       ZEND_ARG_INFO(0, size)
       ZEND_ARG_INFO(0, number)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWops_read, 0, 0, 2)
       ZEND_ARG_INFO(1, buffer)
       ZEND_ARG_INFO(0, size)
       ZEND_ARG_INFO(0, number)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWwrite, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, RWops, SDL_RWops, 0)
       ZEND_ARG_INFO(0, buffer)
       ZEND_ARG_INFO(0, size)
       ZEND_ARG_INFO(0, number)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWops_write, 0, 0, 1)
       ZEND_ARG_INFO(0, buffer)
       ZEND_ARG_INFO(0, size)
       ZEND_ARG_INFO(0, number)
ZEND_END_ARG_INFO()


ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_write, 0, 0, 2)
       ZEND_ARG_OBJ_INFO(0, RWops, SDL_RWops, 0)
       ZEND_ARG_INFO(0, value)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWops_writeint, 0, 0, 1)
       ZEND_ARG_INFO(0, value)
ZEND_END_ARG_INFO()



ZEND_BEGIN_ARG_INFO_EX(arginfo_SDL_RWops, 0, 0, 1)
       ZEND_ARG_OBJ_INFO(0, RWops, SDL_RWops, 0)
ZEND_END_ARG_INFO()

PHP_FUNCTION(SDL_AllocRW);
PHP_FUNCTION(SDL_RWFromFile);
PHP_FUNCTION(SDL_RWFromConstMem);
PHP_FUNCTION(SDL_RWFromMem);
PHP_FUNCTION(SDL_RWFromFP);
PHP_FUNCTION(SDL_FreeRW);
PHP_FUNCTION(SDL_RWsize);
PHP_FUNCTION(SDL_RWseek);
PHP_FUNCTION(SDL_RWtell);
PHP_FUNCTION(SDL_RWclose);
PHP_FUNCTION(SDL_RWread);
PHP_FUNCTION(SDL_RWwrite);
PHP_FUNCTION(SDL_ReadU8);
PHP_FUNCTION(SDL_ReadLE16);
PHP_FUNCTION(SDL_ReadBE16);
PHP_FUNCTION(SDL_ReadLE32);
PHP_FUNCTION(SDL_ReadBE32);
PHP_FUNCTION(SDL_ReadLE64);
PHP_FUNCTION(SDL_ReadBE64);
PHP_FUNCTION(SDL_WriteU8);
PHP_FUNCTION(SDL_WriteLE16);
PHP_FUNCTION(SDL_WriteBE16);
PHP_FUNCTION(SDL_WriteLE32);
PHP_FUNCTION(SDL_WriteBE32);
PHP_FUNCTION(SDL_WriteLE64);
PHP_FUNCTION(SDL_WriteBE64);

PHP_MINIT_FUNCTION(sdl_rwops);

#ifdef  __cplusplus
} // extern "C"
#endif

#endif /* PHP_SDL_RWOPS_H */
