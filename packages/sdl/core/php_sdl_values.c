/* Snapshot value objects before calling SDL. PHP License 3.01. */
#include "php_sdl_extra.h"
#include "rect.h"
#include "pixels.h"
#include <limits.h>
#include <math.h>

static zend_bool read_shape(zval *value, zend_class_entry *ce, void *output, int count, int kind)
{
	ZVAL_DEREF(value);
	if (Z_TYPE_P(value) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(value), ce)) {
		zend_type_error("value must be %s", ZSTR_VAL(ce->name)); return 0;
	}
	const char *coordinates[] = {"x", "y", "w", "h"};
	const char *channels[] = {"r", "g", "b", "a"};
	zval object; ZVAL_COPY(&object, value);
	zend_bool valid = 1;
	for (int i = 0; i < count; i++) {
		zval temporary; ZVAL_UNDEF(&temporary);
		zval *part = zend_read_property(ce, Z_OBJ(object), kind == 2 ? channels[i] : coordinates[i], 1, 0, &temporary);
		if (!EG(exception)) {
			ZVAL_DEREF(part);
			if (kind == 1) {
				if (Z_TYPE_P(part) != IS_LONG && Z_TYPE_P(part) != IS_DOUBLE) {
					zend_type_error("coordinates must be numbers");
				} else {
					double number = zval_get_double(part);
					if (!isfinite(number) || !isfinite((float)number)) { zend_value_error("coordinates must fit finite float32"); }
					else { ((float *)output)[i] = number; }
				}
			} else if (Z_TYPE_P(part) != IS_LONG || Z_LVAL_P(part) < (kind == 2 ? 0 : INT_MIN)
				|| Z_LVAL_P(part) > (kind == 2 ? 255 : INT_MAX)) {
				zend_value_error(kind == 2 ? "color channels must be integers between 0 and 255" : "coordinates must be int32 integers");
			} else if (kind == 2) { ((Uint8 *)output)[i] = Z_LVAL_P(part); }
			else { ((int *)output)[i] = Z_LVAL_P(part); }
		}
		zval_ptr_dtor(&temporary);
		if (EG(exception)) { valid = 0; break; }
	}
	zval_ptr_dtor(&object);
	return valid && !EG(exception);
}

zend_bool php_sdl_read_rect(zval *value, SDL_Rect *result) { return read_shape(value, get_php_sdl_rect_ce(), result, 4, 0); }
zend_bool php_sdl_read_frect(zval *value, SDL_FRect *result) { return read_shape(value, get_php_sdl_frect_ce(), result, 4, 1); }
zend_bool php_sdl_read_point(zval *value, SDL_Point *result) { return read_shape(value, get_php_sdl_point_ce(), result, 2, 0); }
zend_bool php_sdl_read_fpoint(zval *value, SDL_FPoint *result) { return read_shape(value, get_php_sdl_fpoint_ce(), result, 2, 1); }
zend_bool php_sdl_read_color(zval *value, SDL_Color *result) { return read_shape(value, get_php_sdl_color_ce(), result, 4, 2); }

zend_bool php_sdl_write_rect(zval *value, const SDL_Rect *rect)
{
	ZVAL_DEREF(value);
	if (Z_TYPE_P(value) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(value), get_php_sdl_rect_ce())) {
		zend_type_error("rectangle output must be SDL_Rect"); return 0;
	}
	zval object; ZVAL_COPY(&object, value);
	const char *names[] = {"x", "y", "w", "h"};
	const int components[] = {rect->x, rect->y, rect->w, rect->h};
	for (int i = 0; i < 4 && !EG(exception); i++) {
		zend_update_property_long(get_php_sdl_rect_ce(), Z_OBJ(object), names[i], 1, components[i]);
	}
	zval_ptr_dtor(&object);
	return !EG(exception);
}
