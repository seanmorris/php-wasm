#ifndef PHP_MIX_CHUNK_H
#define PHP_MIX_CHUNK_H

#include "php_sdl_mixer.h"

typedef struct _php_mix_chunk_object {
	Mix_Chunk *mix_chunk;
	zend_object std;
} php_mix_chunk_object;

php_mix_chunk_object *php_mix_chunk_object_from_zend_object(zend_object *zobj);
zend_object *php_mix_chunk_object_to_zend_object(php_mix_chunk_object *obj);

Mix_Chunk* php_mix_chunk_from_zval_p(zval* zp);
void mix_chunk_to_zval(Mix_Chunk *mix_chunk, zval *zp);
zend_object *php_mix_chunk_object_create(zend_class_entry *ce);

void php_mix_chunk_object_free(zend_object *zobj);
zend_function *php_mix_chunk_object_get_constructor(zend_object *object);

zend_result php_mix_chunk_minit_helper(void);

void php_mix_chunk_release(zval *value);
void php_mix_chunk_request_init(void);
void php_mix_chunk_request_shutdown(void);

#endif
