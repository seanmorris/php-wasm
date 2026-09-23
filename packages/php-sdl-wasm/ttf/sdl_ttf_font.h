#ifndef PHP_TTF_FONT_H
#define PHP_TTF_FONT_H

#include "php.h"
#include "php_sdl_ttf.h"
#include <SDL2/SDL_ttf.h>

typedef struct _php_tff_font_object
{
    TTF_Font *internal;
    zend_object std;
} php_ttf_font_object;

php_ttf_font_object *php_ttf_font_object_from_zend_object(zend_object *zobj);
zend_object *php_ttf_font_object_to_zend_object(php_ttf_font_object *obj);

TTF_Font *php_ttf_font_from_zval_p(zval *zp);
void ttf_font_to_zval(TTF_Font *ttf_font, zval *zp);
zend_object *php_ttf_font_object_create(zend_class_entry *ce);

void php_ttf_font_object_free(zend_object *zobj);
zend_function *php_ttf_font_object_get_constructor(zend_object *object);

zend_result php_ttf_font_minit_helper(void);

void php_ttf_font_release(zval *value);
void php_ttf_fonts_init(void);
void php_ttf_fonts_close(void);
void php_ttf_fonts_shutdown(void);

#endif
