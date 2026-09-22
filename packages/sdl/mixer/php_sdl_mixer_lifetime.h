/* PHP-owned mixer resources. PHP License 3.01. */
#ifndef PHP_SDL_MIXER_LIFETIME_H
#define PHP_SDL_MIXER_LIFETIME_H

#include "php_sdl_mixer.h"
#include <limits.h>
#include <math.h>

int php_mix_available(void);
int php_mix_require_audio(void);
int php_mix_channel(zend_long channel, int argument, int special);
int php_mix_range(zend_long value, zend_long minimum, zend_long maximum, int argument);
int php_mix_open(int frequency, Uint16 format, int channels, int size, const char *device, int changes);
void php_mix_close(int all);
void php_mix_quit(void);
int php_mix_audio_shutdown(void);

void php_mix_chunk_channels_resize(int count);
void php_mix_chunk_channel_set(int channel, zval *value);
void php_mix_chunk_channel_get(int channel, zval *result);
void php_mix_chunks_close(void);
void php_mix_musics_close(void);
void php_mix_music_collect(void);
void php_mix_music_current_set(zval *value);
void php_mix_music_halt(void);

#endif
