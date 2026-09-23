#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include "effect_position.h"

#include "../php_sdl_mixer_lifetime.h"

PHP_FUNCTION(Mix_SetPosition)
{
	zend_long channel;
	zend_long angle;
	zend_long distance;

	ZEND_PARSE_PARAMETERS_START(3, 3);
		Z_PARAM_LONG(channel)
		Z_PARAM_LONG(angle)
		Z_PARAM_LONG(distance)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_channel(channel, 1, MIX_CHANNEL_POST)) { RETURN_THROWS(); }

	if (!php_mix_range(angle, INT16_MIN, INT16_MAX, 2) || !php_mix_range(distance, 0, UINT8_MAX, 3)) { RETURN_THROWS(); }
	int result = Mix_SetPosition(channel, angle, distance);

	RETURN_LONG(result);
}

PHP_FUNCTION(Mix_SetDistance)
{
	zend_long channel;
	zend_long distance;

	ZEND_PARSE_PARAMETERS_START(2, 2);
		Z_PARAM_LONG(channel)
		Z_PARAM_LONG(distance)
	ZEND_PARSE_PARAMETERS_END();
	if (!php_mix_channel(channel, 1, MIX_CHANNEL_POST)) { RETURN_THROWS(); }

	if (!php_mix_range(distance, 0, UINT8_MAX, 2)) { RETURN_THROWS(); }
	int result = Mix_SetDistance(channel, distance);

	RETURN_LONG(result);
}
