#include "ext/sdl/src/php_sdl_extra.h"
/* PHP License 3.01. */
#include "Mix_Chunk.h"
#include "Mix_Chunk_arginfo.h"
#include "zend_interfaces.h"
#include "../php_sdl_mixer_lifetime.h"

zend_class_entry *mix_chunk_ce = NULL;
static HashTable live_chunks;
static zend_object **channels;
static int channel_count;
zend_object_handlers php_mix_chunk_object_handlers;

php_mix_chunk_object *php_mix_chunk_object_from_zend_object(zend_object *object)
{
	return (php_mix_chunk_object *)((char *)object - XtOffsetOf(php_mix_chunk_object, std));
}

zend_object *php_mix_chunk_object_to_zend_object(php_mix_chunk_object *object)
{
	return &object->std;
}

Mix_Chunk *php_mix_chunk_from_zval_p(zval *value)
{
	Mix_Chunk *chunk = php_mix_chunk_object_from_zend_object(Z_OBJ_P(value))->mix_chunk;
	if (!chunk) { zend_throw_error(NULL, "Mix_Chunk has been freed"); }
	return chunk;
}

void mix_chunk_to_zval(Mix_Chunk *chunk, zval *value)
{
	if (!chunk) { ZVAL_NULL(value); return; }
	object_init_ex(value, mix_chunk_ce);
	php_mix_chunk_object *object = php_mix_chunk_object_from_zend_object(Z_OBJ_P(value));
	object->mix_chunk = chunk;
	/* Weak registry; only an associated channel keeps a playback reference. */
	zend_hash_index_add_ptr(&live_chunks, (zend_ulong)(uintptr_t)chunk, object);
}

zend_object *php_mix_chunk_object_create(zend_class_entry *ce)
{
	php_mix_chunk_object *object = zend_object_alloc(sizeof(*object), ce);
	object->mix_chunk = NULL;
	zend_object_std_init(&object->std, ce);
	object_properties_init(&object->std, ce);
	object->std.handlers = &php_mix_chunk_object_handlers;
	return &object->std;
}

static void chunk_close(php_mix_chunk_object *object)
{
	Mix_Chunk *chunk = object->mix_chunk;
	if (!chunk) { return; }
	object->mix_chunk = NULL;
	zend_hash_index_del(&live_chunks, (zend_ulong)(uintptr_t)chunk);
	/* Native free halts playback, but leaves channel.chunk dangling. Never
	 * construct a PHP wrapper from that pointer after the owner is gone. */
	Mix_FreeChunk(chunk);
	int references = 0;
	for (int i = 0; i < channel_count; i++) {
		if (channels[i] == &object->std) { channels[i] = NULL; references++; }
	}
	while (references--) { OBJ_RELEASE(&object->std); }
}

void php_mix_chunk_object_free(zend_object *object)
{
	chunk_close(php_mix_chunk_object_from_zend_object(object));
	zend_object_std_dtor(object);
}

zend_function *php_mix_chunk_object_get_constructor(zend_object *object)
{
	zend_throw_error(NULL, "You cannot initialize a Mix_Chunk object except through helper functions");
	return NULL;
}

zend_result php_mix_chunk_minit_helper(void)
{
	mix_chunk_ce = register_class_Mix_Chunk();
	mix_chunk_ce->create_object = php_mix_chunk_object_create;
	if (php_sdl_deny_serialization(mix_chunk_ce) != SUCCESS) { return FAILURE; }
	memcpy(&php_mix_chunk_object_handlers, &std_object_handlers, sizeof(zend_object_handlers));
	php_mix_chunk_object_handlers.clone_obj = NULL;
	php_mix_chunk_object_handlers.free_obj = php_mix_chunk_object_free;
	php_mix_chunk_object_handlers.get_constructor = php_mix_chunk_object_get_constructor;
	php_mix_chunk_object_handlers.offset = XtOffsetOf(php_mix_chunk_object, std);
	return SUCCESS;
}

void php_mix_chunk_release(zval *value)
{
	chunk_close(php_mix_chunk_object_from_zend_object(Z_OBJ_P(value)));
}

void php_mix_chunk_channels_resize(int count)
{
	zend_object **previous = channels;
	int previous_count = channel_count;
	channels = count ? ecalloc(count, sizeof(*channels)) : NULL;
	channel_count = count;
	int kept = count < previous_count ? count : previous_count;
	if (kept) { memcpy(channels, previous, kept * sizeof(*channels)); }
	/* Publish the new table before releasing PHP objects: property
	 * destructors can call back into the mixer and replace this table. */
	for (int i = kept; i < previous_count; i++) {
		if (previous[i]) { OBJ_RELEASE(previous[i]); }
	}
	if (previous) { efree(previous); }
}

void php_mix_chunk_channel_set(int channel, zval *value)
{
	if (channel < 0 || channel >= channel_count) { return; }
	zend_object *previous = channels[channel];
	channels[channel] = Z_OBJ_P(value);
	GC_ADDREF(channels[channel]);
	if (previous) { OBJ_RELEASE(previous); }
}

void php_mix_chunk_channel_get(int channel, zval *result)
{
	ZVAL_NULL(result);
	if (channel < 0 || channel >= channel_count || !channels[channel]) { return; }
	php_mix_chunk_object *object = php_mix_chunk_object_from_zend_object(channels[channel]);
	if (object->mix_chunk && Mix_GetChunk(channel) == object->mix_chunk) {
		ZVAL_OBJ_COPY(result, &object->std);
	}
}

void php_mix_chunks_close(void)
{
	/* No native playback may outlive the channel references. */
	if (Mix_QuerySpec(NULL, NULL, NULL)) { Mix_HaltChannel(-1); }
	php_mix_chunk_channels_resize(0);
	while (zend_hash_num_elements(&live_chunks)) {
		php_mix_chunk_object *object;
		ZEND_HASH_FOREACH_PTR(&live_chunks, object) {
			GC_ADDREF(&object->std);
			chunk_close(object);
			OBJ_RELEASE(&object->std);
			break;
		} ZEND_HASH_FOREACH_END();
	}
}

void php_mix_chunk_request_init(void)
{
	channels = NULL;
	channel_count = 0;
	zend_hash_init(&live_chunks, 8, NULL, NULL, 0);
}

void php_mix_chunk_request_shutdown(void)
{
	php_mix_chunks_close();
	zend_hash_destroy(&live_chunks);
}
