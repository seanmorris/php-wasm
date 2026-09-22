#include "ext/sdl/src/php_sdl_extra.h"
/* PHP License 3.01. */
#include "Mix_Music.h"
#include "Mix_Music_arginfo.h"
#include "zend_interfaces.h"
#include "../php_sdl_mixer_lifetime.h"

zend_class_entry *mix_music_ce = NULL;
static HashTable live_musics;
static zend_object *current_music;
zend_object_handlers php_mix_music_object_handlers;

php_mix_music_object *php_mix_music_object_from_zend_object(zend_object *object)
{
	return (php_mix_music_object *)((char *)object - XtOffsetOf(php_mix_music_object, std));
}

zend_object *php_mix_music_object_to_zend_object(php_mix_music_object *object)
{
	return &object->std;
}

Mix_Music *php_mix_music_from_zval_p(zval *value)
{
	Mix_Music *music = php_mix_music_object_from_zend_object(Z_OBJ_P(value))->mix_music;
	if (!music) { zend_throw_error(NULL, "Mix_Music has been freed"); }
	return music;
}

void mix_music_to_zval(Mix_Music *music, zval *value)
{
	if (!music) { ZVAL_NULL(value); return; }
	object_init_ex(value, mix_music_ce);
	php_mix_music_object *object = php_mix_music_object_from_zend_object(Z_OBJ_P(value));
	object->mix_music = music;
	zend_hash_index_add_ptr(&live_musics, (zend_ulong)(uintptr_t)music, object);
}

zend_object *php_mix_music_object_create(zend_class_entry *ce)
{
	php_mix_music_object *object = zend_object_alloc(sizeof(*object), ce);
	object->mix_music = NULL;
	object->rw_buffer = NULL;
	zend_object_std_init(&object->std, ce);
	object_properties_init(&object->std, ce);
	object->std.handlers = &php_mix_music_object_handlers;
	return &object->std;
}

void php_mix_music_current_set(zval *value)
{
	zend_object *previous = current_music;
	current_music = value ? Z_OBJ_P(value) : NULL;
	if (current_music) { GC_ADDREF(current_music); }
	if (previous) { OBJ_RELEASE(previous); }
}

void php_mix_music_collect(void)
{
	/* Audio callbacks never enter Zend. Release completed playback at the
	 * next PHP mixer call, after detaching the reference for reentrancy. */
	if (current_music && !Mix_PlayingMusic()) {
		Mix_HaltMusic();
		php_mix_music_current_set(NULL);
	}
}

void php_mix_music_halt(void)
{
	Mix_HaltMusic();
	php_mix_music_current_set(NULL);
}

static void music_close(php_mix_music_object *object)
{
	Mix_Music *music = object->mix_music;
	if (!music) { return; }
	object->mix_music = NULL;
	zend_hash_index_del(&live_musics, (zend_ulong)(uintptr_t)music);
	zend_object *held = NULL;
	if (current_music == &object->std) {
		/* Mix_FreeMusic waits for a fade, which cannot advance while the
		 * browser suspends audio. An explicit free cancels its playback. */
		Mix_HaltMusic();
		held = current_music;
		current_music = NULL;
	}
	Mix_FreeMusic(music);
	if (object->rw_buffer) { efree(object->rw_buffer); object->rw_buffer = NULL; }
	if (held) { OBJ_RELEASE(held); }
}

void php_mix_music_object_free(zend_object *object)
{
	music_close(php_mix_music_object_from_zend_object(object));
	zend_object_std_dtor(object);
}

zend_function *php_mix_music_object_get_constructor(zend_object *object)
{
	zend_throw_error(NULL, "You cannot initialize a Mix_Music object except through helper functions");
	return NULL;
}

zend_result php_mix_music_minit_helper(void)
{
	mix_music_ce = register_class_Mix_Music();
	mix_music_ce->create_object = php_mix_music_object_create;
	if (php_sdl_deny_serialization(mix_music_ce) != SUCCESS) { return FAILURE; }
	memcpy(&php_mix_music_object_handlers, &std_object_handlers, sizeof(zend_object_handlers));
	php_mix_music_object_handlers.clone_obj = NULL;
	php_mix_music_object_handlers.free_obj = php_mix_music_object_free;
	php_mix_music_object_handlers.get_constructor = php_mix_music_object_get_constructor;
	php_mix_music_object_handlers.offset = XtOffsetOf(php_mix_music_object, std);
	return SUCCESS;
}

void php_mix_music_release(zval *value)
{
	music_close(php_mix_music_object_from_zend_object(Z_OBJ_P(value)));
}

void php_mix_musics_close(void)
{
	php_mix_music_halt();
	while (zend_hash_num_elements(&live_musics)) {
		php_mix_music_object *object;
		ZEND_HASH_FOREACH_PTR(&live_musics, object) {
			GC_ADDREF(&object->std);
			music_close(object);
			OBJ_RELEASE(&object->std);
			break;
		} ZEND_HASH_FOREACH_END();
	}
}

void php_mix_music_request_init(void)
{
	current_music = NULL;
	zend_hash_init(&live_musics, 8, NULL, NULL, 0);
}

void php_mix_music_request_shutdown(void)
{
	php_mix_musics_close();
	zend_hash_destroy(&live_musics);
}
