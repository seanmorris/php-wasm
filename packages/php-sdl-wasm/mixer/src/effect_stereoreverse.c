#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include "effect_position.h"

#include "../php_sdl_mixer_lifetime.h"

PHP_FUNCTION(Mix_SetReverseStereo)
{
    zend_long channel;

    zend_long flip;

    ZEND_PARSE_PARAMETERS_START(2, 2);
        Z_PARAM_LONG(channel)
        Z_PARAM_LONG(flip)
    ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_channel(channel, 1, MIX_CHANNEL_POST)) { RETURN_THROWS(); }

    int result = Mix_SetReverseStereo(channel, flip);

    RETURN_LONG(result);
}
