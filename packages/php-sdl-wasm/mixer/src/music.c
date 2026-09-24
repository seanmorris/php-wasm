#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include "music.h"

extern zend_class_entry *mix_music_ce;
extern zend_class_entry *get_php_sdl_rwops_ce(void);
extern SDL_RWops *zval_to_sdl_rwops(zval *z_val);
#define php_sdl_rwops_from_zval_p zval_to_sdl_rwops
#include "../php_sdl_mixer_rw.h"

#include "../php_sdl_mixer_lifetime.h"

PHP_FUNCTION(Mix_LoadMUS)
{
	char *file = NULL;
	size_t file_len = 0;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_PATH(file, file_len)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	Mix_Music * result = Mix_LoadMUS((const char*)file);

	if (result == NULL) {
		RETURN_NULL();
	}

	mix_music_to_zval(result, return_value);
}

PHP_FUNCTION(Mix_LoadMUS_RW)
{
	zval *SRC, owner;
	SDL_RWops *src;

	zend_long freesrc;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_OBJECT_OF_CLASS(SRC, get_php_sdl_rwops_ce())
		Z_PARAM_LONG(freesrc)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio()) { RETURN_THROWS(); }
	ZVAL_COPY_DEREF(&owner, SRC);
	src = php_sdl_rwops_from_zval_p(&owner);
	if (!src) { zval_ptr_dtor(&owner); RETURN_THROWS(); }

	void *buffer = NULL;
	SDL_RWops *copy = php_sdl_mixer_snapshot_rw(src, &buffer);
	if (freesrc) { php_sdl_mixer_close_rw(&owner); }
	zval_ptr_dtor(&owner);
	if (EG(exception) || !php_mix_require_audio()) { if (copy) { SDL_RWclose(copy); efree(buffer); } RETURN_THROWS(); }
	if (!copy) { RETURN_NULL(); }
	Mix_Music * result = Mix_LoadMUS_RW(copy, 1);
	if (!result) { efree(buffer); RETURN_NULL(); }
	mix_music_to_zval(result, return_value);
	php_mix_music_object_from_zend_object(Z_OBJ_P(return_value))->rw_buffer = buffer;

}

PHP_FUNCTION(Mix_FreeMusic)
{
	zval *MUSIC;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_OBJECT_OF_CLASS(MUSIC, mix_music_ce)
	ZEND_PARSE_PARAMETERS_END();
	php_mix_music_release(MUSIC);
}

PHP_FUNCTION(Mix_GetNumMusicDecoders)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_GetNumMusicDecoders();

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GetMusicDecoder)
{
	zend_long index;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(index)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	const char * result = Mix_GetMusicDecoder(index);

	if (!result) { RETURN_NULL(); }
	RETURN_STRING(result);
}

#if defined(HAVE_MIX_HASMUSICDECODER)
PHP_FUNCTION(Mix_HasMusicDecoder)
{
	char *name = NULL;
	size_t name_len = 0;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_STRING(name, name_len)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	SDL_bool result = Mix_HasMusicDecoder((const char*)name);

	RETURN_BOOL(result == SDL_TRUE);
}
#endif

PHP_FUNCTION(Mix_PlayMusic)
{
	zval *MUSIC;
	Mix_Music *music;

	zend_long loops;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_OBJECT_OF_CLASS(MUSIC, mix_music_ce)
		Z_PARAM_LONG(loops)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio() || !php_mix_range(loops, -1, INT_MAX, 2)) { RETURN_THROWS(); }
	music = php_mix_music_from_zval_p(MUSIC);
	if (!music) { RETURN_THROWS(); }

	/* Native replacement waits for an old fade, even while audio is suspended. */
	if (Mix_FadingMusic() == MIX_FADING_OUT) { Mix_HaltMusic(); }
	int result = Mix_FadeInMusicPos(music, loops, 0, 0.0);
	if (result == 0) { php_mix_music_current_set(MUSIC); }
	else { php_mix_music_collect(); }
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_FadeInMusic)
{
	zval *MUSIC;
	Mix_Music *music;

	zend_long loops;

	zend_long ms;

	ZEND_PARSE_PARAMETERS_START(3, 3);
		Z_PARAM_OBJECT_OF_CLASS(MUSIC, mix_music_ce)
		Z_PARAM_LONG(loops)
		Z_PARAM_LONG(ms)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio() || !php_mix_range(loops, -1, INT_MAX, 2)) { RETURN_THROWS(); }
	if (!php_mix_range(ms, 0, INT_MAX, 3)) { RETURN_THROWS(); }
	music = php_mix_music_from_zval_p(MUSIC);
	if (!music) { RETURN_THROWS(); }

	/* Native replacement waits for an old fade, even while audio is suspended. */
	if (Mix_FadingMusic() == MIX_FADING_OUT) { Mix_HaltMusic(); }
	int result = Mix_FadeInMusicPos(music, loops, ms, 0.0);
	if (result == 0) { php_mix_music_current_set(MUSIC); }
	else { php_mix_music_collect(); }
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_FadeInMusicPos)
{
	zval *MUSIC;
	Mix_Music *music;
	zend_long loops;
	zend_long ms;
	double position;

	ZEND_PARSE_PARAMETERS_START(4, 4);
		Z_PARAM_OBJECT_OF_CLASS(MUSIC, mix_music_ce)
		Z_PARAM_LONG(loops)
		Z_PARAM_LONG(ms)
		Z_PARAM_DOUBLE(position)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }
	if (!php_mix_require_audio() || !php_mix_range(loops, -1, INT_MAX, 2)) { RETURN_THROWS(); }
	if (!php_mix_range(ms, 0, INT_MAX, 3)) { RETURN_THROWS(); }
	if (!isfinite(position) || position < 0) { zend_argument_value_error(4, "must be finite and nonnegative"); RETURN_THROWS(); }
	music = php_mix_music_from_zval_p(MUSIC);
	if (!music) { RETURN_THROWS(); }

	/* Native replacement waits for an old fade, even while audio is suspended. */
	if (Mix_FadingMusic() == MIX_FADING_OUT) { Mix_HaltMusic(); }
	int result = Mix_FadeInMusicPos(music, loops, ms, position);
	if (result == 0) { php_mix_music_current_set(MUSIC); }
	else { php_mix_music_collect(); }
	if (EG(exception)) { RETURN_THROWS(); }

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_VolumeMusic)
{
	zend_long volume;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(volume)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!php_mix_range(volume, INT_MIN, INT_MAX, 1)) { RETURN_THROWS(); }
	int result = Mix_VolumeMusic(volume);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_HaltMusic)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	php_mix_music_halt();
	int result = 0;

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_FadeOutMusic)
{
	zend_long ms;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(ms)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!php_mix_range(ms, 0, INT_MAX, 1)) { RETURN_THROWS(); }
	int result = Mix_FadeOutMusic(ms);
	php_mix_music_collect();

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_PauseMusic)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	Mix_PauseMusic();
}

PHP_FUNCTION(Mix_ResumeMusic)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	Mix_ResumeMusic();
}

PHP_FUNCTION(Mix_RewindMusic)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	Mix_RewindMusic();
}

PHP_FUNCTION(Mix_PausedMusic)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_PausedMusic();

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_SetMusicPosition)
{
	double position;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_DOUBLE(position)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	if (!isfinite(position) || position < 0) { zend_argument_value_error(1, "must be finite and nonnegative"); RETURN_THROWS(); }
	int result = Mix_SetMusicPosition(position);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_PlayingMusic)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_PlayingMusic();

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_SetMusicCMD)
{
	char *command = NULL;
	size_t command_len = 0;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_STRING(command, command_len)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_SetMusicCMD((const char*)command);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_SetSynchroValue)
{
	zend_long value;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_LONG(value)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_SetSynchroValue(value);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GetSynchroValue)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_GetSynchroValue();

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_SetSoundFonts)
{
	char *paths = NULL;
	size_t paths_len = 0;

	ZEND_PARSE_PARAMETERS_START(1, 1);
		Z_PARAM_STRING(paths, paths_len)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_available()) { RETURN_THROWS(); }

	int result = Mix_SetSoundFonts((const char*)paths);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_GetSoundFonts)
{
	ZEND_PARSE_PARAMETERS_NONE();
	if (!php_mix_available()) { RETURN_THROWS(); }

	const char* result = Mix_GetSoundFonts();

	if (!result) { RETURN_NULL(); }
	RETURN_STRING(result);
}
