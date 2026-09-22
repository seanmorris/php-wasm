/* PHP SDL event marshalling. Distributed under the PHP license.
 * Only typed fields cross the PHP boundary; native pointers never do. */
#include "php_sdl_extra.h"
#include "event.h"
#include <inttypes.h>
#include <errno.h>
#include <math.h>

typedef enum { U8, U16, U32, I16, I32, I64, F32, TEXT } field_type;
typedef struct { const char *name; size_t offset; field_type type; size_t size; } event_field;
#define FIELD(member, name, type) { #name, offsetof(SDL_Event, member.name), type, sizeof(((SDL_Event *)0)->member.name) }
#define END { NULL, 0, 0, 0 }

static const event_field window_fields[] = {
	FIELD(window, type, U32), FIELD(window, timestamp, U32),
	FIELD(window, windowID, U32),
	FIELD(window, event, U8),
	FIELD(window, data1, I32),
	FIELD(window, data2, I32),
	END
};

static const event_field key_fields[] = {
	FIELD(key, type, U32), FIELD(key, timestamp, U32),
	FIELD(key, windowID, U32),
	FIELD(key, state, U8),
	FIELD(key, repeat, U8),
	END
};

static const event_field motion_fields[] = {
	FIELD(motion, type, U32), FIELD(motion, timestamp, U32),
	FIELD(motion, windowID, U32),
	FIELD(motion, which, U32),
	FIELD(motion, state, U32),
	FIELD(motion, x, I32),
	FIELD(motion, y, I32),
	FIELD(motion, xrel, I32),
	FIELD(motion, yrel, I32),
	END
};

static const event_field button_fields[] = {
	FIELD(button, type, U32), FIELD(button, timestamp, U32),
	FIELD(button, windowID, U32),
	FIELD(button, which, U32),
	FIELD(button, button, U8),
	FIELD(button, state, U8),
	FIELD(button, clicks, U8),
	FIELD(button, x, I32),
	FIELD(button, y, I32),
	END
};

static const event_field wheel_fields[] = {
	FIELD(wheel, type, U32), FIELD(wheel, timestamp, U32),
	FIELD(wheel, windowID, U32),
	FIELD(wheel, which, U32),
	FIELD(wheel, x, I32),
	FIELD(wheel, y, I32),
	FIELD(wheel, direction, U32),
	FIELD(wheel, preciseX, F32),
	FIELD(wheel, preciseY, F32),
	FIELD(wheel, mouseX, I32),
	FIELD(wheel, mouseY, I32),
	END
};

static const event_field edit_fields[] = {
	FIELD(edit, type, U32), FIELD(edit, timestamp, U32),
	FIELD(edit, windowID, U32),
	FIELD(edit, text, TEXT),
	FIELD(edit, start, I32),
	FIELD(edit, length, I32),
	END
};

static const event_field editExt_fields[] = {
	FIELD(editExt, type, U32), FIELD(editExt, timestamp, U32),
	FIELD(editExt, windowID, U32),
	FIELD(editExt, start, I32),
	FIELD(editExt, length, I32),
	END
};

static const event_field text_fields[] = {
	FIELD(text, type, U32), FIELD(text, timestamp, U32),
	FIELD(text, windowID, U32),
	FIELD(text, text, TEXT),
	END
};

static const event_field jaxis_fields[] = {
	FIELD(jaxis, type, U32), FIELD(jaxis, timestamp, U32),
	FIELD(jaxis, which, I32),
	FIELD(jaxis, axis, U8),
	FIELD(jaxis, value, I16),
	END
};

static const event_field jball_fields[] = {
	FIELD(jball, type, U32), FIELD(jball, timestamp, U32),
	FIELD(jball, which, I32),
	FIELD(jball, ball, U8),
	FIELD(jball, xrel, I16),
	FIELD(jball, yrel, I16),
	END
};

static const event_field jhat_fields[] = {
	FIELD(jhat, type, U32), FIELD(jhat, timestamp, U32),
	FIELD(jhat, which, I32),
	FIELD(jhat, hat, U8),
	FIELD(jhat, value, U8),
	END
};

static const event_field jbutton_fields[] = {
	FIELD(jbutton, type, U32), FIELD(jbutton, timestamp, U32),
	FIELD(jbutton, which, I32),
	FIELD(jbutton, button, U8),
	FIELD(jbutton, state, U8),
	END
};

static const event_field jdevice_fields[] = {
	FIELD(jdevice, type, U32), FIELD(jdevice, timestamp, U32),
	FIELD(jdevice, which, I32),
	END
};

static const event_field jbattery_fields[] = {
	FIELD(jbattery, type, U32), FIELD(jbattery, timestamp, U32),
	FIELD(jbattery, which, I32),
	FIELD(jbattery, level, I32),
	END
};

static const event_field caxis_fields[] = {
	FIELD(caxis, type, U32), FIELD(caxis, timestamp, U32),
	FIELD(caxis, which, I32),
	FIELD(caxis, axis, U8),
	FIELD(caxis, value, I16),
	END
};

static const event_field cbutton_fields[] = {
	FIELD(cbutton, type, U32), FIELD(cbutton, timestamp, U32),
	FIELD(cbutton, which, I32),
	FIELD(cbutton, button, U8),
	FIELD(cbutton, state, U8),
	END
};

static const event_field cdevice_fields[] = {
	FIELD(cdevice, type, U32), FIELD(cdevice, timestamp, U32),
	FIELD(cdevice, which, I32),
	END
};

static const event_field ctouchpad_fields[] = {
	FIELD(ctouchpad, type, U32), FIELD(ctouchpad, timestamp, U32),
	FIELD(ctouchpad, which, I32),
	FIELD(ctouchpad, touchpad, I32),
	FIELD(ctouchpad, finger, I32),
	FIELD(ctouchpad, x, F32),
	FIELD(ctouchpad, y, F32),
	FIELD(ctouchpad, pressure, F32),
	END
};

static const event_field tfinger_fields[] = {
	FIELD(tfinger, type, U32), FIELD(tfinger, timestamp, U32),
	FIELD(tfinger, touchId, I64),
	FIELD(tfinger, fingerId, I64),
	FIELD(tfinger, x, F32),
	FIELD(tfinger, y, F32),
	FIELD(tfinger, dx, F32),
	FIELD(tfinger, dy, F32),
	FIELD(tfinger, pressure, F32),
	FIELD(tfinger, windowID, U32),
	END
};

static const event_field mgesture_fields[] = {
	FIELD(mgesture, type, U32), FIELD(mgesture, timestamp, U32),
	FIELD(mgesture, touchId, I64),
	FIELD(mgesture, dTheta, F32),
	FIELD(mgesture, dDist, F32),
	FIELD(mgesture, x, F32),
	FIELD(mgesture, y, F32),
	FIELD(mgesture, numFingers, U16),
	END
};

static const event_field dgesture_fields[] = {
	FIELD(dgesture, type, U32), FIELD(dgesture, timestamp, U32),
	FIELD(dgesture, touchId, I64),
	FIELD(dgesture, gestureId, I64),
	FIELD(dgesture, numFingers, U32),
	FIELD(dgesture, error, F32),
	FIELD(dgesture, x, F32),
	FIELD(dgesture, y, F32),
	END
};

static const event_field adevice_fields[] = {
	FIELD(adevice, type, U32), FIELD(adevice, timestamp, U32),
	FIELD(adevice, which, U32),
	FIELD(adevice, iscapture, U8),
	END
};

static const event_field display_fields[] = {
	FIELD(display, type, U32), FIELD(display, timestamp, U32),
	FIELD(display, display, U32),
	FIELD(display, event, U8),
	FIELD(display, data1, I32),
	END
};

static const event_field drop_fields[] = {
	FIELD(drop, type, U32), FIELD(drop, timestamp, U32),
	FIELD(drop, windowID, U32),
	END
};

static const event_field keysym_fields[] = {
	FIELD(key, keysym.scancode, I32), FIELD(key, keysym.sym, I32),
	FIELD(key, keysym.mod, U16), END
};

static const event_field *event_fields(Uint32 type, const char **member)
{
	switch (type) {
	case SDL_WINDOWEVENT:
		*member = "window"; return window_fields;
	case SDL_KEYDOWN:
	case SDL_KEYUP:
		*member = "key"; return key_fields;
	case SDL_MOUSEMOTION:
		*member = "motion"; return motion_fields;
	case SDL_MOUSEBUTTONDOWN:
	case SDL_MOUSEBUTTONUP:
		*member = "button"; return button_fields;
	case SDL_MOUSEWHEEL:
		*member = "wheel"; return wheel_fields;
	case SDL_TEXTEDITING:
		*member = "edit"; return edit_fields;
	case SDL_TEXTEDITING_EXT:
		*member = "editExt"; return editExt_fields;
	case SDL_TEXTINPUT:
		*member = "text"; return text_fields;
	case SDL_JOYAXISMOTION:
		*member = "jaxis"; return jaxis_fields;
	case SDL_JOYBALLMOTION:
		*member = "jball"; return jball_fields;
	case SDL_JOYHATMOTION:
		*member = "jhat"; return jhat_fields;
	case SDL_JOYBUTTONDOWN:
	case SDL_JOYBUTTONUP:
		*member = "jbutton"; return jbutton_fields;
	case SDL_JOYDEVICEADDED:
	case SDL_JOYDEVICEREMOVED:
		*member = "jdevice"; return jdevice_fields;
	case SDL_JOYBATTERYUPDATED:
		*member = "jbattery"; return jbattery_fields;
	case SDL_CONTROLLERAXISMOTION:
		*member = "caxis"; return caxis_fields;
	case SDL_CONTROLLERBUTTONDOWN:
	case SDL_CONTROLLERBUTTONUP:
		*member = "cbutton"; return cbutton_fields;
	case SDL_CONTROLLERDEVICEADDED:
	case SDL_CONTROLLERDEVICEREMOVED:
	case SDL_CONTROLLERDEVICEREMAPPED:
		*member = "cdevice"; return cdevice_fields;
	case SDL_CONTROLLERTOUCHPADDOWN:
	case SDL_CONTROLLERTOUCHPADMOTION:
	case SDL_CONTROLLERTOUCHPADUP:
		*member = "ctouchpad"; return ctouchpad_fields;
	case SDL_FINGERDOWN:
	case SDL_FINGERUP:
	case SDL_FINGERMOTION:
		*member = "tfinger"; return tfinger_fields;
	case SDL_MULTIGESTURE:
		*member = "mgesture"; return mgesture_fields;
	case SDL_DOLLARGESTURE:
	case SDL_DOLLARRECORD:
		*member = "dgesture"; return dgesture_fields;
	case SDL_AUDIODEVICEADDED:
	case SDL_AUDIODEVICEREMOVED:
		*member = "adevice"; return adevice_fields;
	case SDL_DISPLAYEVENT:
		*member = "display"; return display_fields;
	case SDL_DROPFILE:
	case SDL_DROPTEXT:
	case SDL_DROPBEGIN:
	case SDL_DROPCOMPLETE:
		*member = "drop"; return drop_fields;

	default: *member = NULL; return NULL;
	}
}

static void decode_fields(SDL_Event *event, zval *object, const event_field *fields)
{
	for (const event_field *field = fields; field->name; field++) {
		const void *data = (const char *)event + field->offset;
		zval value;
		switch (field->type) {
		case U8: ZVAL_LONG(&value, *(const Uint8 *)data); break;
		case U16: ZVAL_LONG(&value, *(const Uint16 *)data); break;
		case U32: php_sdl_uint64(&value, *(const Uint32 *)data); break;
		case I16: ZVAL_LONG(&value, *(const Sint16 *)data); break;
		case I32: ZVAL_LONG(&value, *(const Sint32 *)data); break;
		case I64: {
			Sint64 number = *(const Sint64 *)data;
			if (number >= ZEND_LONG_MIN && number <= ZEND_LONG_MAX) {
				ZVAL_LONG(&value, (zend_long)number);
			} else {
				char buffer[32];
				snprintf(buffer, sizeof(buffer), "%" PRId64, (int64_t)number);
				ZVAL_STRING(&value, buffer);
			}
			break;
		}
		case F32: ZVAL_DOUBLE(&value, *(const float *)data); break;
		case TEXT: ZVAL_STRINGL(&value, data, strnlen(data, field->size)); break;
		}
		const char *name = strrchr(field->name, '.');
		add_property_zval(object, name ? name + 1 : field->name, &value);
		zval_ptr_dtor(&value);
	}
}

zend_bool php_sdl_decode_event(SDL_Event *event, zval *value)
{
	zval_ptr_dtor(value);
	if (!event) { ZVAL_NULL(value); return 0; }
	object_init_ex(value, get_php_sdl_event_ce());
	add_property_long(value, "type", event->type);
	zval timestamp;
	php_sdl_uint64(&timestamp, event->common.timestamp);
	add_property_zval(value, "timestamp", &timestamp);
	zval_ptr_dtor(&timestamp);
	const char *member;
	const event_field *fields = event_fields(event->type, &member);
	if (fields) {
		zval payload;
		object_init(&payload);
		decode_fields(event, &payload, fields);
		if (event->type == SDL_KEYDOWN || event->type == SDL_KEYUP) {
			zval keysym;
			object_init(&keysym);
			decode_fields(event, &keysym, keysym_fields);
			add_property_zval(&payload, "keysym", &keysym);
			zval_ptr_dtor(&keysym);
		}
		if (event->type == SDL_DROPFILE || event->type == SDL_DROPTEXT) {
			add_property_string(&payload, "file", event->drop.file ? event->drop.file : "");
			SDL_free(event->drop.file);
			event->drop.file = NULL;
		}
		if (event->type == SDL_TEXTEDITING_EXT) {
			add_property_string(&payload, "text", event->editExt.text ? event->editExt.text : "");
			SDL_free(event->editExt.text);
			event->editExt.text = NULL;
		}
		add_property_zval(value, member, &payload);
		zval_ptr_dtor(&payload);
	}
	return 1;
}

/* PushEvent is also useful for application-generated input. Reject pointer
 * payloads and out-of-range fields instead of exposing native memory. */
static zend_bool encode_fields(SDL_Event *event, zval *object, const event_field *fields)
{
	for (const event_field *field = fields; field->name; field++) {
		const char *name = strrchr(field->name, '.');
		name = name ? name + 1 : field->name;
		if (!strcmp(name, "type") || !strcmp(name, "timestamp")) { continue; }
		zval rv;
		zval *value = zend_read_property(Z_OBJCE_P(object), Z_OBJ_P(object), name, strlen(name), 1, &rv);
		if (!value || Z_TYPE_P(value) == IS_NULL || Z_TYPE_P(value) == IS_UNDEF) { continue; }
		void *data = (char *)event + field->offset;
		if (field->type == TEXT) {
			if (Z_TYPE_P(value) != IS_STRING || Z_STRLEN_P(value) >= field->size || memchr(Z_STRVAL_P(value), 0, Z_STRLEN_P(value))) {
				zend_value_error("event %s must be a string shorter than %zu bytes without NUL", name, field->size); return 0;
			}
			memcpy(data, Z_STRVAL_P(value), Z_STRLEN_P(value));
			continue;
		}
		if (field->type == F32) {
			if (Z_TYPE_P(value) != IS_DOUBLE && Z_TYPE_P(value) != IS_LONG) {
				zend_type_error("event %s must be numeric", name); return 0;
			}
			double number = zval_get_double(value);
			if (!isfinite(number) || !isfinite((float)number)) {
				zend_value_error("event %s must be a finite float", name); return 0;
			}
			*(float *)data = (float)number;
			continue;
		}
		int64_t number;
		if (Z_TYPE_P(value) == IS_LONG) { number = Z_LVAL_P(value); }
		else if (Z_TYPE_P(value) == IS_STRING && (field->type == I64 || field->type == U32)) {
			char *end;
			errno = 0;
			number = strtoimax(Z_STRVAL_P(value), &end, 10);
			if (errno || end == Z_STRVAL_P(value) || end != Z_STRVAL_P(value) + Z_STRLEN_P(value)) {
				zend_value_error("event %s must be an exact decimal integer", name); return 0;
			}
		} else { zend_type_error("event %s must be an integer", name); return 0; }
		int64_t minimum = 0, maximum = 0;
		switch (field->type) {
		case U8: maximum = UINT8_MAX; break;
		case U16: maximum = UINT16_MAX; break;
		case U32: maximum = UINT32_MAX; break;
		case I16: minimum = INT16_MIN; maximum = INT16_MAX; break;
		case I32: minimum = INT32_MIN; maximum = INT32_MAX; break;
		case I64: minimum = INT64_MIN; maximum = INT64_MAX; break;
		default: return 0;
		}
		if (number < minimum || number > maximum) { zend_value_error("event %s is out of range", name); return 0; }
		switch (field->type) {
		case U8: *(Uint8 *)data = number; break;
		case U16: *(Uint16 *)data = number; break;
		case U32: *(Uint32 *)data = number; break;
		case I16: *(Sint16 *)data = number; break;
		case I32: *(Sint32 *)data = number; break;
		case I64: *(Sint64 *)data = number; break;
		default: break;
		}
	}
	return 1;
}

PHP_FUNCTION(SDL_PushEvent)
{
	zval *value, rv;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, get_php_sdl_event_ce()) == FAILURE) { RETURN_THROWS(); }
	zval *type = zend_read_property(get_php_sdl_event_ce(), Z_OBJ_P(value), ZEND_STRL("type"), 1, &rv);
	if (Z_TYPE_P(type) != IS_LONG || Z_LVAL_P(type) < 0 || Z_LVAL_P(type) >= SDL_LASTEVENT) {
		zend_value_error("event type must be a valid SDL event integer"); RETURN_THROWS();
	}
	SDL_Event event = {0};
	event.type = Z_LVAL_P(type);
	const char *member;
	const event_field *fields = event_fields(event.type, &member);
	if ((!fields && event.type != SDL_QUIT) || event.type == SDL_DROPFILE || event.type == SDL_DROPTEXT || event.type == SDL_TEXTEDITING_EXT) {
		zend_value_error("this event type cannot be pushed from PHP"); RETURN_THROWS();
	}
	if (fields) {
		zval *payload = zend_read_property(get_php_sdl_event_ce(), Z_OBJ_P(value), member, strlen(member), 1, &rv);
		if (Z_TYPE_P(payload) != IS_OBJECT) { zend_type_error("event %s must be an object", member); RETURN_THROWS(); }
		if (!encode_fields(&event, payload, fields)) { RETURN_THROWS(); }
		if (event.type == SDL_KEYDOWN || event.type == SDL_KEYUP) {
			zval rv_key;
			zval *keysym = zend_read_property(Z_OBJCE_P(payload), Z_OBJ_P(payload), ZEND_STRL("keysym"), 1, &rv_key);
			if (Z_TYPE_P(keysym) != IS_OBJECT) { zend_type_error("event key.keysym must be an object"); RETURN_THROWS(); }
			if (!encode_fields(&event, keysym, keysym_fields)) { RETURN_THROWS(); }
		}
	}
	RETURN_LONG(SDL_PushEvent(&event));
}

PHP_FUNCTION(SDL_PumpEvents) { ZEND_PARSE_PARAMETERS_NONE(); SDL_PumpEvents(); }
