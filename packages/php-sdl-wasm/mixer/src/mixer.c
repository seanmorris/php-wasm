#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include "mixer.h"

extern zend_class_entry *mix_chunk_ce;
extern zend_class_entry *get_php_sdl_rwops_ce(void);
extern SDL_RWops *zval_to_sdl_rwops(zval *z_val);
#define php_sdl_rwops_from_zval_p zval_to_sdl_rwops
#include "../php_sdl_mixer_rw.h"

#include "../php_sdl_mixer_lifetime.h"

PHP_FUNCTION(Mix_Init)
{
	zend_long flags;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(flags)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_range(flags, 0, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_Init(flags);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_Quit)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	php_mix_quit();
}

PHP_FUNCTION(Mix_OpenAudio)
{
	zend_long frequency;
	zend_long format;
	zend_long channels;
	zend_long chunksize;

	ZEND_PARSE_PARAMETERS_START(4, 4);
		Z_PARAM_LONG(frequency)
		Z_PARAM_LONG(format)
		Z_PARAM_LONG(channels)
		Z_PARAM_LONG(chunksize)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!php_mix_range(frequency, 0, INT_MAX, 1) || !php_mix_range(format, 0, UINT16_MAX, 2)
		|| !php_mix_range(channels, 0, UINT8_MAX, 3) || !php_mix_range(chunksize, 0, UINT16_MAX, 4)) { RETURN_THROWS(); }
	int result = php_mix_open(frequency, format, channels, chunksize, NULL, SDL_AUDIO_ALLOW_FREQUENCY_CHANGE | SDL_AUDIO_ALLOW_CHANNELS_CHANGE);
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_OpenAudioDevice)
{
	zend_long frequency;
	zend_long format;
	zend_long channels;
	zend_long chunksize;

	char *device = NULL;
	size_t device_len = 0;

	zend_long allowed_changes;

	ZEND_PARSE_PARAMETERS_START(6, 6);
		Z_PARAM_LONG(frequency)
		Z_PARAM_LONG(format)
		Z_PARAM_LONG(channels)
		Z_PARAM_LONG(chunksize)
		Z_PARAM_STRING_OR_NULL(device, device_len)
		Z_PARAM_LONG(allowed_changes)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!php_mix_range(frequency, 0, INT_MAX, 1) || !php_mix_range(format, 0, UINT16_MAX, 2)
		|| !php_mix_range(channels, 0, UINT8_MAX, 3) || !php_mix_range(chunksize, 0, UINT16_MAX, 4)) { RETURN_THROWS(); }
	if (!php_mix_range(allowed_changes, 0, SDL_AUDIO_ALLOW_ANY_CHANGE, 6)) { RETURN_THROWS(); }
	if (device && memchr(device, 0, device_len)) { zend_argument_value_error(5, "must not contain NUL bytes"); RETURN_THROWS(); }
	int result = php_mix_open(frequency, format, channels, chunksize, device, allowed_changes);
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_AllocateChannels)
{
	zend_long numchans;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(numchans)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!php_mix_range(numchans, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }
	if (numchans < 0 && !Mix_QuerySpec(NULL, NULL, NULL)) { RETURN_LONG(0); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	int result = Mix_AllocateChannels(numchans);
	if (result >= 0 && numchans >= 0) { php_mix_chunk_channels_resize(result); }
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_QuerySpec)
{
	zval *z_frequency = NULL;
	int frequency = 0;
	zval *z_format = NULL;
	Uint16 format = 0;
	zval *z_channels = NULL;
	int channels = 0;

	ZEND_PARSE_PARAMETERS_START(3, 3);
		Z_PARAM_ZVAL(z_frequency)
		Z_PARAM_ZVAL(z_format)
		Z_PARAM_ZVAL(z_channels)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_QuerySpec(&frequency, &format, &channels);
	ZEND_TRY_ASSIGN_REF_LONG(z_frequency, frequency);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_format, format);
	if (EG(exception)) { RETURN_THROWS(); }
	ZEND_TRY_ASSIGN_REF_LONG(z_channels, channels);
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_LoadWAV_RW)
{
	zval *source, owner;
	zend_long freesrc;
	ZEND_PARSE_PARAMETERS_START(2, 2)
		Z_PARAM_OBJECT_OF_CLASS(source, get_php_sdl_rwops_ce())
		Z_PARAM_LONG(freesrc)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	ZVAL_COPY_DEREF(&owner, source);
	SDL_RWops *rwops = zval_to_sdl_rwops(&owner);
	if (!rwops) { zval_ptr_dtor(&owner); RETURN_THROWS(); }
	void *buffer = NULL;
	SDL_RWops *copy = php_sdl_mixer_snapshot_rw(rwops, &buffer);
	if (freesrc) { php_sdl_mixer_close_rw(&owner); }
	zval_ptr_dtor(&owner);
	if (EG(exception) || !php_mix_require_audio()) {
		if (copy) { SDL_RWclose(copy); efree(buffer); }
		RETURN_THROWS();
	}
	if (!copy) { RETURN_NULL(); }
	Mix_Chunk *chunk = Mix_LoadWAV_RW(copy, 1);
	efree(buffer);
	mix_chunk_to_zval(chunk, return_value);
}

PHP_FUNCTION(Mix_LoadWAV)
{
	char *file = NULL;
	size_t file_len = 0;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_PATH(file, file_len)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }

	Mix_Chunk * result = Mix_LoadWAV((const char*)file);

	if (result == NULL) {
		RETURN_NULL();
	}

	mix_chunk_to_zval(result, return_value);
}

PHP_FUNCTION(Mix_FreeChunk)
{
	zval *CHUNK;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_OBJECT_OF_CLASS(CHUNK, mix_chunk_ce)
	ZEND_PARSE_PARAMETERS_END();
	php_mix_chunk_release(CHUNK);
}

PHP_FUNCTION(Mix_GetNumChunkDecoders)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_GetNumChunkDecoders();

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GetChunkDecoder)
{
	zend_long index;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(index)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	const char * result = Mix_GetChunkDecoder(index);

	if (!result) { RETURN_NULL(); }
	RETURN_STRING(result);
}

PHP_FUNCTION(Mix_HasChunkDecoder)
{
	char *name = NULL;
	size_t name_len = 0;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_STRING(name, name_len)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	SDL_bool result = Mix_HasChunkDecoder((const char*)name);

	RETURN_BOOL(result == SDL_TRUE);
}

PHP_FUNCTION(Mix_ReserveChannels)
{
	zend_long num;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(num)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(num, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_ReserveChannels(num);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GroupChannel)
{
	zend_long which;
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_LONG(which)
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(which, 1, INT_MIN)) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 2)) { RETURN_THROWS(); }

	int result = Mix_GroupChannel(which, tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GroupChannels)
{
	zend_long from;
	zend_long to;
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(3, 3);
		Z_PARAM_LONG(from)
		Z_PARAM_LONG(to)
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(from, 1, INT_MIN)) { RETURN_THROWS(); }
	if (!php_mix_channel(to, 2, INT_MIN)) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 3)) { RETURN_THROWS(); }
	if (from > to) { zend_argument_value_error(2, "must be greater than or equal to the first channel"); RETURN_THROWS(); }

	int result = Mix_GroupChannels(from, to, tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GroupAvailable)
{
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_GroupAvailable(tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GroupCount)
{
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_GroupCount(tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GroupOldest)
{
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_GroupOldest(tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GroupNewer)
{
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_GroupNewer(tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_PlayChannel)
{
	zend_long channel;
	zval *CHUNK;
	Mix_Chunk *chunk;
	zend_long loops;

	ZEND_PARSE_PARAMETERS_START(3, 3);
		Z_PARAM_LONG(channel)
		Z_PARAM_OBJECT_OF_CLASS(CHUNK, mix_chunk_ce)
		Z_PARAM_LONG(loops)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }
	if (!php_mix_range(loops, -1, INT_MAX, 3)) { RETURN_THROWS(); }

	chunk = php_mix_chunk_from_zval_p(CHUNK);
	if (!chunk) { RETURN_THROWS(); }

	int result = Mix_PlayChannel(channel, chunk, loops);

	if (result >= 0) { php_mix_chunk_channel_set(result, CHUNK); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_PlayChannelTimed)
{
	zend_long channel;
	zval *CHUNK;
	Mix_Chunk *chunk;
	zend_long loops;
	zend_long ticks;

	ZEND_PARSE_PARAMETERS_START(4, 4);
		Z_PARAM_LONG(channel)
		Z_PARAM_OBJECT_OF_CLASS(CHUNK, mix_chunk_ce)
		Z_PARAM_LONG(loops)
		Z_PARAM_LONG(ticks)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }
	if (!php_mix_range(loops, -1, INT_MAX, 3)) { RETURN_THROWS(); }
	if (!php_mix_range(ticks, -1, INT_MAX, 4)) { RETURN_THROWS(); }

	chunk = php_mix_chunk_from_zval_p(CHUNK);
	if (!chunk) { RETURN_THROWS(); }

	int result = Mix_PlayChannelTimed(channel, chunk, loops, ticks);

	if (result >= 0) { php_mix_chunk_channel_set(result, CHUNK); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_FadeInChannelTimed)
{
	zend_long channel;
	zval *CHUNK;
	Mix_Chunk *chunk;
	zend_long loops;
	zend_long ms;
	zend_long ticks;

	ZEND_PARSE_PARAMETERS_START(5, 5);
		Z_PARAM_LONG(channel)
		Z_PARAM_OBJECT_OF_CLASS(CHUNK, mix_chunk_ce)
		Z_PARAM_LONG(loops)
		Z_PARAM_LONG(ms)
		Z_PARAM_LONG(ticks)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }
	if (!php_mix_range(loops, -1, INT_MAX, 3)) { RETURN_THROWS(); }
	if (!php_mix_range(ms, 0, INT_MAX, 4)) { RETURN_THROWS(); }
	if (!php_mix_range(ticks, -1, INT_MAX, 5)) { RETURN_THROWS(); }

	chunk = php_mix_chunk_from_zval_p(CHUNK);
	if (!chunk) { RETURN_THROWS(); }

	int result = Mix_FadeInChannelTimed(channel, chunk, loops, ms, ticks);

	if (result >= 0) { php_mix_chunk_channel_set(result, CHUNK); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_Volume)
{
	zend_long channel;
	zend_long volume;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_LONG(channel)
		Z_PARAM_LONG(volume)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }
	if (!php_mix_range(volume, INT_MIN, INT_MAX, 2)) { RETURN_THROWS(); }

	int result = Mix_Volume(channel, volume);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_VolumeChunk)
{
	zval *CHUNK;
	Mix_Chunk *chunk;
	zend_long volume;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_OBJECT_OF_CLASS(CHUNK, mix_chunk_ce)
		Z_PARAM_LONG(volume)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_range(volume, INT_MIN, INT_MAX, 2)) { RETURN_THROWS(); }
	chunk = php_mix_chunk_from_zval_p(CHUNK);
	if (!chunk) { RETURN_THROWS(); }

	int result = Mix_VolumeChunk(chunk, volume);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_HaltChannel)
{
	zend_long channel;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(channel)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }

	int result = Mix_HaltChannel(channel);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_HaltGroup)
{
	zend_long tag;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(tag)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }

	int result = Mix_HaltGroup(tag);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_ExpireChannel)
{
	zend_long channel;
	zend_long ticks;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_LONG(channel)
		Z_PARAM_LONG(ticks)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }
	if (!php_mix_range(ticks, -1, INT_MAX, 2)) { RETURN_THROWS(); }

	int result = Mix_ExpireChannel(channel, ticks);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_FadeOutChannel)
{
	zend_long which;
	zend_long ms;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_LONG(which)
		Z_PARAM_LONG(ms)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(which, 1, -1)) { RETURN_THROWS(); }
	if (!php_mix_range(ms, 0, INT_MAX, 2)) { RETURN_THROWS(); }

	int result = Mix_FadeOutChannel(which, ms);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_FadeOutGroup)
{
	zend_long tag;
	zend_long ms;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_LONG(tag)
		Z_PARAM_LONG(ms)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	if (!php_mix_range(tag, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }
	if (!php_mix_range(ms, 0, INT_MAX, 2)) { RETURN_THROWS(); }

	int result = Mix_FadeOutGroup(tag, ms);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_Pause)
{
	zend_long channel;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(channel)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }

	Mix_Pause(channel);
}

PHP_FUNCTION(Mix_Resume)
{
	zend_long channel;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(channel)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }

	Mix_Resume(channel);
}

PHP_FUNCTION(Mix_Paused)
{
	zend_long channel;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(channel)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_range(channel, -1, INT_MAX, 1)) { RETURN_THROWS(); }
	if (!Mix_QuerySpec(NULL, NULL, NULL)) { RETURN_LONG(0); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }

	int result = Mix_Paused(channel);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_Playing)
{
	zend_long channel;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(channel)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_range(channel, -1, INT_MAX, 1)) { RETURN_THROWS(); }
	if (!Mix_QuerySpec(NULL, NULL, NULL)) { RETURN_LONG(0); }
	if (!php_mix_channel(channel, 1, -1)) { RETURN_THROWS(); }

	int result = Mix_Playing(channel);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GetChunk)
{
	zend_long channel;
	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_LONG(channel)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_range(channel, 0, INT_MAX, 1)) { RETURN_THROWS(); }
	if (!Mix_QuerySpec(NULL, NULL, NULL)) { RETURN_NULL(); }
	if (!php_mix_channel(channel, 1, INT_MIN)) { RETURN_THROWS(); }
	php_mix_chunk_channel_get(channel, return_value);
}

PHP_FUNCTION(Mix_CloseAudio)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	php_mix_close(0);
}

PHP_FUNCTION(Mix_GetError) {
	const char *error;

	if (zend_parse_parameters_none() == FAILURE) {
		RETURN_THROWS();
	}

	error = Mix_GetError();
	if (error) {
		RETURN_STRING(error);
	}
}
