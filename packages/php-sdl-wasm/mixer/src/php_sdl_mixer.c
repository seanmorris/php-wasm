#include "php_sdl_mixer.h"
#include "mixer.h"
#include "music.h"
#include "php_sdl_mixer_arginfo.h"
#include "zend_smart_string.h"
#include "../php_sdl_mixer_lifetime.h"

extern void php_sdl_audio_cleanup_register(int (*cleanup)(void));
static zend_bool mixer_changing;
static zend_bool request_active;

int php_mix_available(void)
{
	if (!request_active || mixer_changing) {
		zend_throw_error(NULL, "SDL_mixer audio teardown is in progress");
		return 0;
	}
	php_mix_music_collect();
	return !EG(exception);
}

int php_mix_require_audio(void)
{
	if (!php_mix_available()) { return 0; }
	if (!Mix_QuerySpec(NULL, NULL, NULL)) {
		zend_throw_error(NULL, "SDL_mixer audio device is not open");
		return 0;
	}
	return 1;
}

int php_mix_range(zend_long value, zend_long minimum, zend_long maximum, int argument)
{
	if (value < minimum || value > maximum) {
		zend_argument_value_error(argument, "must be between " ZEND_LONG_FMT " and " ZEND_LONG_FMT, minimum, maximum);
		return 0;
	}
	return 1;
}

int php_mix_channel(zend_long channel, int argument, int special)
{
	if (!php_mix_require_audio()) { return 0; }
	if ((special != INT_MIN && channel == special) || (channel >= 0 && channel < Mix_AllocateChannels(-1))) { return 1; }
	zend_argument_value_error(argument, "must identify an allocated mixer channel%s", special == -1 ? " or be -1" : special == MIX_CHANNEL_POST ? " or be MIX_CHANNEL_POST" : "");
	return 0;
}

void php_mix_close(int all)
{
	if (mixer_changing) { return; }
	int references = Mix_QuerySpec(NULL, NULL, NULL);
	if (!all && references > 1) { Mix_CloseAudio(); return; }
	mixer_changing = 1;
	if (request_active) {
		php_mix_chunks_close();
		php_mix_musics_close();
	}
	while (Mix_QuerySpec(NULL, NULL, NULL)) { Mix_CloseAudio(); }
	mixer_changing = 0;
}

int php_mix_audio_shutdown(void)
{
	if (mixer_changing) {
		zend_throw_error(NULL, "SDL_mixer audio teardown is in progress");
		return 0;
	}
	php_mix_close(1);
	return 1;
}

void php_mix_quit(void)
{
	/* Decoder unload cannot leave native music contexts behind. Chunks
	 * already contain decoded PCM and may keep playing. */
	mixer_changing = 1;
	php_mix_musics_close();
	Mix_Quit();
	mixer_changing = 0;
}

int php_mix_open(int frequency, Uint16 format, int channels, int size, const char *device, int changes)
{
	if (!php_mix_available()) { return -1; }
	Uint16 previous_format;
	int previous_channels;
	int references = Mix_QuerySpec(NULL, &previous_format, &previous_channels);
	if (references && (previous_format != format || previous_channels != channels)) {
		php_mix_close(1);
		if (EG(exception)) { return -1; }
		references = 0;
	}
	if (references == INT_MAX) { zend_value_error("Too many SDL_mixer audio opens"); return -1; }
	int result = Mix_OpenAudioDevice(frequency, format, channels, size, device, changes);
	if (!result && !references) { php_mix_chunk_channels_resize(Mix_AllocateChannels(-1)); }
	return result;
}

#ifdef COMPILE_DL_SDL_MIXER
ZEND_GET_MODULE(sdl_mixer)
#endif

#define PHP_MINIT_CALL(func) PHP_MINIT(func)(INIT_FUNC_ARGS_PASSTHRU)

static int sld_mixer_flags;

/* {{{ PHP_MINIT_FUNCTION */
PHP_MINIT_FUNCTION(sdl_mixer)
{
	sld_mixer_flags = Mix_Init(MIX_INIT_OGG);

	if (php_mix_chunk_minit_helper() != SUCCESS) { return FAILURE; }
	if (php_mix_music_minit_helper() != SUCCESS) { return FAILURE; }
	php_sdl_audio_cleanup_register(php_mix_audio_shutdown);
	REGISTER_LONG_CONSTANT("MIX_CHANNEL_POST", MIX_CHANNEL_POST, CONST_CS | CONST_PERSISTENT);

    REGISTER_LONG_CONSTANT("MIX_DEFAULT_CHANNELS", MIX_DEFAULT_CHANNELS, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_DEFAULT_FREQUENCY", MIX_DEFAULT_FREQUENCY, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_DEFAULT_FORMAT", MIX_DEFAULT_FORMAT, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_MAX_VOLUME", MIX_MAX_VOLUME, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_CHANNELS", MIX_CHANNELS, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_INIT_OGG", MIX_INIT_OGG, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_INIT_MP3", MIX_INIT_MP3, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_INIT_FLAC", MIX_INIT_FLAC, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_INIT_MOD", MIX_INIT_MOD, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_INIT_MID", MIX_INIT_MID, CONST_CS | CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MIX_INIT_OPUS", MIX_INIT_OPUS, CONST_CS | CONST_PERSISTENT);

	return SUCCESS;
}
/* }}} */

/* {{{ PHP_MINIT_FUNCTION */
PHP_MSHUTDOWN_FUNCTION(sdl_mixer)
{
	Mix_Quit();

	return SUCCESS;
}
/* }}} */

PHP_MINFO_FUNCTION(sdl_mixer)
{
	char buffer[128];
	smart_string info = {0};
	SDL_version compile_version;
	const SDL_version *link_version = Mix_Linked_Version();
	SDL_MIXER_VERSION(&compile_version);

	php_info_print_table_start();
	php_info_print_table_row(2, "SDL_mixer support", "enabled");
	php_info_print_table_row(2, "SDL_mixer PHP extension version", PHP_SDL_MIXER_VERSION);
	snprintf(buffer, sizeof(buffer), "%d.%d.%d", link_version->major, link_version->minor, link_version->patch);
	php_info_print_table_row(2, "SDL_mixer linked version", buffer);
	snprintf(buffer, sizeof(buffer), "%d.%d.%d", compile_version.major, compile_version.minor, compile_version.patch);
	php_info_print_table_row(2, "SDL_mixer compiled version", buffer);
	if (sld_mixer_flags & MIX_INIT_FLAC) {
		smart_string_appends(&info, "flac");
	}
	if (sld_mixer_flags & MIX_INIT_MOD) {
		smart_string_appends(&info, ", mod");
	}
	if (sld_mixer_flags & MIX_INIT_MP3) {
		smart_string_appends(&info, ", mp3");
	}
	if (sld_mixer_flags & MIX_INIT_OGG) {
		smart_string_appends(&info, ", ogg");
	}
	if (sld_mixer_flags & MIX_INIT_MID) {
		smart_string_appends(&info, ", mid");
	}
	if (sld_mixer_flags & MIX_INIT_OPUS) {
		smart_string_appends(&info, ", opus");
	}
	smart_string_0(&info);
	php_info_print_table_row(2, "SDL_mixer flags", info.c);
	smart_string_free(&info);

	php_info_print_table_end();
}

PHP_RINIT_FUNCTION(sdl_mixer)
{
	php_mix_chunk_request_init();
	php_mix_music_request_init();
	mixer_changing = 0;
	request_active = 1;
	return SUCCESS;
}

PHP_RSHUTDOWN_FUNCTION(sdl_mixer)
{
	php_mix_close(1);
	mixer_changing = 1;
	php_mix_chunk_request_shutdown();
	php_mix_music_request_shutdown();
	request_active = 0;
	mixer_changing = 0;
	return SUCCESS;
}

static const zend_module_dep ext_deps[] = {
    ZEND_MOD_REQUIRED("sdl")
    ZEND_MOD_END
};

zend_module_entry sdl_mixer_module_entry = {
	STANDARD_MODULE_HEADER_EX,
	NULL,
	ext_deps,
	"SDL_mixer",
	ext_functions,
	PHP_MINIT(sdl_mixer),
	PHP_MSHUTDOWN(sdl_mixer),
	PHP_RINIT(sdl_mixer),
	PHP_RSHUTDOWN(sdl_mixer),
	PHP_MINFO(sdl_mixer),
	PHP_SDL_MIXER_VERSION,
	STANDARD_MODULE_PROPERTIES
};
