/* PHP SDL joystick/controller ownership. Distributed under the PHP license. */
#include "joystick.h"
#include "php_sdl_extra.h"
#include "zend_interfaces.h"

static zend_class_entry *joystick_ce, *controller_ce;
static zend_object_handlers input_handlers;
typedef struct input_handle {
	void *pointer;
	zend_bool controller;
	struct input_handle *next;
	zend_object object;
} input_handle;
static input_handle *inputs;

static input_handle *input_object(zend_object *object)
{
	return (input_handle *)((char *)object - XtOffsetOf(input_handle, object));
}

static void input_close(input_handle *handle)
{
	if (!handle->pointer) { return; }
	if (handle->controller) { SDL_GameControllerClose(handle->pointer); }
	else { SDL_JoystickClose(handle->pointer); }
	handle->pointer = NULL;
}

void php_sdl_joysticks_close(void)
{
	for (input_handle *handle = inputs; handle; handle = handle->next) { input_close(handle); }
}

void php_sdl_joysticks_forget(void)
{
	for (input_handle *handle = inputs; handle; handle = handle->next) {
		if (!SDL_WasInit(handle->controller ? SDL_INIT_GAMECONTROLLER : SDL_INIT_JOYSTICK)) { handle->pointer = NULL; }
	}
}

static zend_object *input_create(zend_class_entry *ce)
{
	input_handle *handle = zend_object_alloc(sizeof(*handle), ce);
	zend_object_std_init(&handle->object, ce);
	object_properties_init(&handle->object, ce);
	handle->object.handlers = &input_handlers;
	handle->controller = ce == controller_ce;
	handle->next = inputs;
	inputs = handle;
	return &handle->object;
}

static void input_free(zend_object *object)
{
	input_handle *handle = input_object(object);
	input_close(handle);
	input_handle **link = &inputs;
	while (*link != handle) { link = &(*link)->next; }
	*link = handle->next;
	zend_object_std_dtor(object);
}

static zend_function *input_constructor(zend_object *object)
{
	zend_throw_error(NULL, "use SDL_JoystickOpen or SDL_GameControllerOpen to create an input handle");
	return NULL;
}

static void *input_pointer(zval *value)
{
	input_handle *handle = input_object(Z_OBJ_P(value));
	if (!handle->pointer) { zend_throw_error(NULL, "input handle is closed"); }
	return handle->pointer;
}

static void input_return(void *pointer, zend_class_entry *ce, zval *value)
{
	if (!pointer) { ZVAL_NULL(value); return; }
	object_init_ex(value, ce);
	input_object(Z_OBJ_P(value))->pointer = pointer;
}

PHP_FUNCTION(SDL_NumJoysticks) { ZEND_PARSE_PARAMETERS_NONE(); RETURN_LONG(SDL_NumJoysticks()); }
PHP_FUNCTION(SDL_JoystickUpdate) { ZEND_PARSE_PARAMETERS_NONE(); SDL_JoystickUpdate(); }
PHP_FUNCTION(SDL_GameControllerUpdate) { ZEND_PARSE_PARAMETERS_NONE(); SDL_GameControllerUpdate(); }

#define INPUT_OPEN(name, ce) PHP_FUNCTION(name) \
{ zend_long index; if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &index) == FAILURE) { RETURN_THROWS(); } \
	if (index < 0 || index >= SDL_NumJoysticks()) { SDL_SetError("invalid device index"); RETURN_NULL(); } \
	input_return(name(index), ce, return_value); }
INPUT_OPEN(SDL_JoystickOpen, joystick_ce)
INPUT_OPEN(SDL_GameControllerOpen, controller_ce)

#define INPUT_CLOSE(name, ce) PHP_FUNCTION(name) \
{ zval *value; if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ce) == FAILURE) { RETURN_THROWS(); } \
	input_close(input_object(Z_OBJ_P(value))); }
INPUT_CLOSE(SDL_JoystickClose, joystick_ce)
INPUT_CLOSE(SDL_GameControllerClose, controller_ce)

#define INPUT_NAME(name, ce, type) PHP_FUNCTION(name) \
{ zval *value; if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ce) == FAILURE) { RETURN_THROWS(); } \
	type *input = input_pointer(value); if (!input) { RETURN_THROWS(); } \
	const char *label = name(input); if (!label) { RETURN_NULL(); } RETURN_STRING(label); }
INPUT_NAME(SDL_JoystickName, joystick_ce, SDL_Joystick)
INPUT_NAME(SDL_GameControllerName, controller_ce, SDL_GameController)

#define INPUT_INDEX_NAME(name) PHP_FUNCTION(name) \
{ zend_long index; if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &index) == FAILURE) { RETURN_THROWS(); } \
	const char *value = name(index); if (!value) { RETURN_NULL(); } RETURN_STRING(value); }
INPUT_INDEX_NAME(SDL_JoystickNameForIndex)
INPUT_INDEX_NAME(SDL_GameControllerNameForIndex)

PHP_FUNCTION(SDL_IsGameController)
{
	zend_long index;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &index) == FAILURE) { RETURN_THROWS(); }
	RETURN_BOOL(SDL_IsGameController(index));
}

PHP_FUNCTION(SDL_JoystickGetDeviceInstanceID)
{
	zend_long index;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &index) == FAILURE) { RETURN_THROWS(); }
	RETURN_LONG(SDL_JoystickGetDeviceInstanceID(index));
}

#define INPUT_INT(name, ce, type) PHP_FUNCTION(name) \
{ zval *value; if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ce) == FAILURE) { RETURN_THROWS(); } \
	type *input = input_pointer(value); if (!input) { RETURN_THROWS(); } RETURN_LONG(name(input)); }
INPUT_INT(SDL_JoystickNumAxes, joystick_ce, SDL_Joystick)
INPUT_INT(SDL_JoystickNumButtons, joystick_ce, SDL_Joystick)
INPUT_INT(SDL_JoystickNumHats, joystick_ce, SDL_Joystick)
INPUT_INT(SDL_JoystickInstanceID, joystick_ce, SDL_Joystick)

#define INPUT_ATTACHED(name, ce, type) PHP_FUNCTION(name) \
{ zval *value; if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, ce) == FAILURE) { RETURN_THROWS(); } \
	type *input = input_pointer(value); if (!input) { RETURN_THROWS(); } RETURN_BOOL(name(input)); }
INPUT_ATTACHED(SDL_JoystickGetAttached, joystick_ce, SDL_Joystick)
INPUT_ATTACHED(SDL_GameControllerGetAttached, controller_ce, SDL_GameController)

#define INPUT_VALUE(name, ce, type, limit) PHP_FUNCTION(name) \
{ zval *value; zend_long index; \
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "Ol", &value, ce, &index) == FAILURE) { RETURN_THROWS(); } \
	type *input = input_pointer(value); if (!input) { RETURN_THROWS(); } \
	if (index < 0 || index >= (limit)) { zend_value_error("input axis, button or hat is out of range"); RETURN_THROWS(); } \
	RETURN_LONG(name(input, index)); }
INPUT_VALUE(SDL_JoystickGetAxis, joystick_ce, SDL_Joystick, SDL_JoystickNumAxes(input))
INPUT_VALUE(SDL_JoystickGetButton, joystick_ce, SDL_Joystick, SDL_JoystickNumButtons(input))
INPUT_VALUE(SDL_JoystickGetHat, joystick_ce, SDL_Joystick, SDL_JoystickNumHats(input))
INPUT_VALUE(SDL_GameControllerGetAxis, controller_ce, SDL_GameController, SDL_CONTROLLER_AXIS_MAX)
INPUT_VALUE(SDL_GameControllerGetButton, controller_ce, SDL_GameController, SDL_CONTROLLER_BUTTON_MAX)

/* Acquire a separate joystick reference: closing either wrapper is independent. */
PHP_FUNCTION(SDL_GameControllerGetJoystick)
{
	zval *value;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, controller_ce) == FAILURE) { RETURN_THROWS(); }
	SDL_GameController *controller = input_pointer(value);
	if (!controller) { RETURN_THROWS(); }
	SDL_JoystickID id = SDL_JoystickInstanceID(SDL_GameControllerGetJoystick(controller));
	for (int index = 0; index < SDL_NumJoysticks(); index++) {
		if (SDL_JoystickGetDeviceInstanceID(index) == id) {
			input_return(SDL_JoystickOpen(index), joystick_ce, return_value); return;
		}
	}
	RETURN_NULL();
}

PHP_FUNCTION(SDL_GameControllerAddMapping)
{
	char *mapping; size_t length;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "s", &mapping, &length) == FAILURE) { RETURN_THROWS(); }
	if (memchr(mapping, 0, length)) { zend_value_error("mapping must not contain NUL"); RETURN_THROWS(); }
	RETURN_LONG(SDL_GameControllerAddMapping(mapping));
}

PHP_FUNCTION(SDL_GameControllerMapping)
{
	zval *value;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "O", &value, controller_ce) == FAILURE) { RETURN_THROWS(); }
	SDL_GameController *controller = input_pointer(value);
	if (!controller) { RETURN_THROWS(); }
	char *mapping = SDL_GameControllerMapping(controller);
	if (!mapping) { RETURN_NULL(); }
	RETVAL_STRING(mapping);
	SDL_free(mapping);
}

#define EVENT_STATE(name) PHP_FUNCTION(name) \
{ zend_long state; if (zend_parse_parameters(ZEND_NUM_ARGS(), "l", &state) == FAILURE) { RETURN_THROWS(); } \
	if (state < SDL_QUERY || state > SDL_ENABLE) { zend_value_error("state must be SDL_QUERY, SDL_IGNORE or SDL_ENABLE"); RETURN_THROWS(); } \
	RETURN_LONG(name(state)); }
EVENT_STATE(SDL_JoystickEventState)
EVENT_STATE(SDL_GameControllerEventState)

PHP_MINIT_FUNCTION(sdl_joystick)
{
	zend_class_entry ce;
	INIT_CLASS_ENTRY(ce, "SDL_Joystick", NULL);
	joystick_ce = zend_register_internal_class(&ce);
	joystick_ce->create_object = input_create;
	joystick_ce->ce_flags |= ZEND_ACC_FINAL;
	if (php_sdl_deny_serialization(joystick_ce) != SUCCESS) { return FAILURE; }
	memcpy(&input_handlers, zend_get_std_object_handlers(), sizeof(input_handlers));
	input_handlers.offset = XtOffsetOf(input_handle, object);
	input_handlers.free_obj = input_free;
	input_handlers.get_constructor = input_constructor;
	input_handlers.clone_obj = NULL;
	return SUCCESS;
}

PHP_MINIT_FUNCTION(sdl_controller)
{
	zend_class_entry ce;
	INIT_CLASS_ENTRY(ce, "SDL_GameController", NULL);
	controller_ce = zend_register_internal_class(&ce);
	controller_ce->create_object = input_create;
	controller_ce->ce_flags |= ZEND_ACC_FINAL;
	if (php_sdl_deny_serialization(controller_ce) != SUCCESS) { return FAILURE; }
#define CONSTANT(name) REGISTER_LONG_CONSTANT(#name, name, CONST_CS | CONST_PERSISTENT)
	CONSTANT(SDL_CONTROLLER_AXIS_INVALID);
	CONSTANT(SDL_CONTROLLER_AXIS_LEFTX); CONSTANT(SDL_CONTROLLER_AXIS_LEFTY);
	CONSTANT(SDL_CONTROLLER_AXIS_RIGHTX); CONSTANT(SDL_CONTROLLER_AXIS_RIGHTY);
	CONSTANT(SDL_CONTROLLER_AXIS_TRIGGERLEFT); CONSTANT(SDL_CONTROLLER_AXIS_TRIGGERRIGHT);
	CONSTANT(SDL_CONTROLLER_AXIS_MAX);
	CONSTANT(SDL_CONTROLLER_BUTTON_INVALID);
	CONSTANT(SDL_CONTROLLER_BUTTON_A); CONSTANT(SDL_CONTROLLER_BUTTON_B);
	CONSTANT(SDL_CONTROLLER_BUTTON_X); CONSTANT(SDL_CONTROLLER_BUTTON_Y);
	CONSTANT(SDL_CONTROLLER_BUTTON_BACK); CONSTANT(SDL_CONTROLLER_BUTTON_GUIDE);
	CONSTANT(SDL_CONTROLLER_BUTTON_START);
	CONSTANT(SDL_CONTROLLER_BUTTON_LEFTSTICK); CONSTANT(SDL_CONTROLLER_BUTTON_RIGHTSTICK);
	CONSTANT(SDL_CONTROLLER_BUTTON_LEFTSHOULDER); CONSTANT(SDL_CONTROLLER_BUTTON_RIGHTSHOULDER);
	CONSTANT(SDL_CONTROLLER_BUTTON_DPAD_UP); CONSTANT(SDL_CONTROLLER_BUTTON_DPAD_DOWN);
	CONSTANT(SDL_CONTROLLER_BUTTON_DPAD_LEFT); CONSTANT(SDL_CONTROLLER_BUTTON_DPAD_RIGHT);
	CONSTANT(SDL_CONTROLLER_BUTTON_MISC1); CONSTANT(SDL_CONTROLLER_BUTTON_TOUCHPAD);
	CONSTANT(SDL_CONTROLLER_BUTTON_PADDLE1); CONSTANT(SDL_CONTROLLER_BUTTON_PADDLE2);
	CONSTANT(SDL_CONTROLLER_BUTTON_PADDLE3); CONSTANT(SDL_CONTROLLER_BUTTON_PADDLE4);
	CONSTANT(SDL_CONTROLLER_BUTTON_MAX);
	CONSTANT(SDL_HAT_CENTERED); CONSTANT(SDL_HAT_UP); CONSTANT(SDL_HAT_RIGHT);
	CONSTANT(SDL_HAT_DOWN); CONSTANT(SDL_HAT_LEFT);
	CONSTANT(SDL_HAT_RIGHTUP); CONSTANT(SDL_HAT_RIGHTDOWN);
	CONSTANT(SDL_HAT_LEFTUP); CONSTANT(SDL_HAT_LEFTDOWN);
	CONSTANT(SDL_QUERY); CONSTANT(SDL_IGNORE); CONSTANT(SDL_ENABLE);
	CONSTANT(SDL_ScaleModeNearest); CONSTANT(SDL_ScaleModeLinear); CONSTANT(SDL_ScaleModeBest);
	return SUCCESS;
}
