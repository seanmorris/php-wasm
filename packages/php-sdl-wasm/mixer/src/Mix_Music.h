#ifndef PHP_MIX_MUSIC_H
#define PHP_MIX_MUSIC_H

#include "php_sdl_mixer.h"

typedef struct _php_mix_music_object {
	Mix_Music *mix_music;
	void *rw_buffer;
	zend_object std;
} php_mix_music_object;

php_mix_music_object *php_mix_music_object_from_zend_object(zend_object *zobj);
zend_object *php_mix_music_object_to_zend_object(php_mix_music_object *obj);

Mix_Music* php_mix_music_from_zval_p(zval* zp);
void mix_music_to_zval(Mix_Music *mix_music, zval *zp);
zend_object *php_mix_music_object_create(zend_class_entry *ce);

void php_mix_music_object_free(zend_object *zobj);
zend_function *php_mix_music_object_get_constructor(zend_object *object);

zend_result php_mix_music_minit_helper(void);

void php_mix_music_release(zval *value);
void php_mix_music_request_init(void);
void php_mix_music_request_shutdown(void);

#endif
