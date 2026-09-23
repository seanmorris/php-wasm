/* PHP SDL binding additions. Distributed under the PHP license. */
#include "php_sdl_extra.h"
#include "php_sdl_extra_arginfo.h"
#include <inttypes.h>
#include "zend_interfaces.h"

/* PHP 8.0 invokes magic methods before legacy serialization callbacks. Final
 * native guards prevent subclasses from bypassing denial without forbidding
 * valid subclasses. Keep the legacy callbacks for custom C-format payloads. */
#ifndef ZEND_ACC_NOT_SERIALIZABLE
ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_sdl_serialize_deny, 0, 0, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_sdl_unserialize_deny, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

static PHP_FUNCTION(sdl_serialize_deny)
{
	ZEND_PARSE_PARAMETERS_NONE();
	zend_throw_exception_ex(NULL, 0, "Serialization of '%s' is not allowed", ZSTR_VAL(Z_OBJCE_P(ZEND_THIS)->name));
	RETURN_THROWS();
}

static PHP_FUNCTION(sdl_unserialize_deny)
{
	HashTable *data;
	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_ARRAY_HT(data)
	ZEND_PARSE_PARAMETERS_END();
	zend_throw_exception_ex(NULL, 0, "Unserialization of '%s' is not allowed", ZSTR_VAL(Z_OBJCE_P(ZEND_THIS)->name));
	RETURN_THROWS();
}

static const zend_function_entry serialization_guards[] = {
	ZEND_FENTRY(__serialize, ZEND_FN(sdl_serialize_deny), arginfo_sdl_serialize_deny, ZEND_ACC_PUBLIC | ZEND_ACC_FINAL)
	ZEND_FENTRY(__unserialize, ZEND_FN(sdl_unserialize_deny), arginfo_sdl_unserialize_deny, ZEND_ACC_PUBLIC | ZEND_ACC_FINAL)
	ZEND_FE_END
};
#endif

zend_result php_sdl_deny_serialization(zend_class_entry *ce)
{
#ifdef ZEND_ACC_NOT_SERIALIZABLE
	ce->ce_flags |= ZEND_ACC_NOT_SERIALIZABLE;
	return SUCCESS;
#else
	ce->serialize = zend_class_serialize_deny;
	ce->unserialize = zend_class_unserialize_deny;
	return zend_register_functions(ce, serialization_guards, &ce->function_table, MODULE_PERSISTENT);
#endif
}

/* A wasm32 PHP integer cannot hold every SDL counter or touch identifier. */
void php_sdl_uint64(zval *value, Uint64 number)
{
	if (number <= ZEND_LONG_MAX) {
		ZVAL_LONG(value, (zend_long)number);
	} else {
		char buffer[32];
		snprintf(buffer, sizeof(buffer), "%" PRIu64, (uint64_t)number);
		ZVAL_STRING(value, buffer);
	}
}

#define COUNTER(name) PHP_FUNCTION(name) \
{ ZEND_PARSE_PARAMETERS_NONE(); php_sdl_uint64(return_value, name()); }
COUNTER(SDL_GetTicks)
COUNTER(SDL_GetTicks64)
COUNTER(SDL_GetPerformanceCounter)
COUNTER(SDL_GetPerformanceFrequency)

PHP_MINIT_FUNCTION(sdl_extra)
{
	if (zend_register_functions(NULL, ext_functions, NULL, MODULE_PERSISTENT) != SUCCESS) {
		return FAILURE;
	}
	if (PHP_MINIT(sdl_controller)(INIT_FUNC_ARGS_PASSTHRU) != SUCCESS) { return FAILURE; }
	return PHP_MINIT(sdl_geometry)(INIT_FUNC_ARGS_PASSTHRU);
}

PHP_RSHUTDOWN_FUNCTION(sdl_extra)
{
	php_sdl_pointer_cleanup(NULL);
	php_sdl_text_cleanup(NULL);
	php_sdl_render_close(NULL);
	php_sdl_contexts_close(NULL);
	php_sdl_joysticks_close();
	return SUCCESS;
}
