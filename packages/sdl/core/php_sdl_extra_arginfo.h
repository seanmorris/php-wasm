/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: 181f3d36ce0e2c1a6202b7000039b2a91d6ec483 */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_MASK_EX(arginfo_SDL_GetTicks, 0, 0, MAY_BE_LONG|MAY_BE_STRING)
ZEND_END_ARG_INFO()

#define arginfo_SDL_GetTicks64 arginfo_SDL_GetTicks

#define arginfo_SDL_GetPerformanceCounter arginfo_SDL_GetTicks

#define arginfo_SDL_GetPerformanceFrequency arginfo_SDL_GetTicks

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_PushEvent, 0, 1, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, event, SDL_Event, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_PumpEvents, 0, 0, IS_VOID, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_UpdateTexture, 0, 4, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_OBJ_INFO(0, rect, SDL_Rect, 1)
	ZEND_ARG_OBJ_TYPE_MASK(0, pixels, SDL_Pixels, MAY_BE_STRING, NULL)
	ZEND_ARG_TYPE_INFO(0, pitch, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_LockTexture, 0, 4, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_OBJ_INFO(0, rect, SDL_Rect, 1)
	ZEND_ARG_OBJ_INFO(1, pixels, SDL_Pixels, 1)
	ZEND_ARG_TYPE_INFO(1, pitch, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_UnlockTexture, 0, 1, IS_VOID, 0)
	ZEND_ARG_INFO(0, texture)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_SetTextureColorMod, 0, 4, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(0, red, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, green, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, blue, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetTextureColorMod, 0, 4, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(1, red, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, green, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(1, blue, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_SetTextureAlphaMod, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(0, alpha, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetTextureAlphaMod, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(1, alpha, IS_LONG, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_SetTextureBlendMode, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(0, mode, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GetTextureBlendMode, 0, 2, IS_LONG, 0)
	ZEND_ARG_INFO(0, texture)
	ZEND_ARG_TYPE_INFO(1, mode, IS_LONG, 1)
ZEND_END_ARG_INFO()

#define arginfo_SDL_SetTextureScaleMode arginfo_SDL_SetTextureBlendMode

#define arginfo_SDL_GetTextureScaleMode arginfo_SDL_GetTextureBlendMode

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_RenderReadPixels, 0, 3, IS_STRING, 1)
	ZEND_ARG_INFO(0, renderer)
	ZEND_ARG_OBJ_INFO(0, rect, SDL_Rect, 1)
	ZEND_ARG_TYPE_INFO(0, format, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_JoystickUpdate arginfo_SDL_PumpEvents

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_JoystickNumAxes, 0, 1, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, joystick, SDL_Joystick, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_JoystickNumHats arginfo_SDL_JoystickNumAxes

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_JoystickGetButton, 0, 2, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, joystick, SDL_Joystick, 0)
	ZEND_ARG_TYPE_INFO(0, button, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_JoystickGetHat, 0, 2, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, joystick, SDL_Joystick, 0)
	ZEND_ARG_TYPE_INFO(0, hat, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_JoystickGetAttached, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_OBJ_INFO(0, joystick, SDL_Joystick, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_JoystickInstanceID arginfo_SDL_JoystickNumAxes

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_JoystickGetDeviceInstanceID, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_JoystickEventState, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, state, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_SDL_GameControllerOpen, 0, 1, SDL_GameController, 1)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerClose, 0, 1, IS_VOID, 0)
	ZEND_ARG_OBJ_INFO(0, controller, SDL_GameController, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerName, 0, 1, IS_STRING, 1)
	ZEND_ARG_OBJ_INFO(0, controller, SDL_GameController, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerNameForIndex, 0, 1, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerGetAxis, 0, 2, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, controller, SDL_GameController, 0)
	ZEND_ARG_TYPE_INFO(0, axis, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerGetButton, 0, 2, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, controller, SDL_GameController, 0)
	ZEND_ARG_TYPE_INFO(0, button, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerGetAttached, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_OBJ_INFO(0, controller, SDL_GameController, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_SDL_GameControllerGetJoystick, 0, 1, SDL_Joystick, 1)
	ZEND_ARG_OBJ_INFO(0, controller, SDL_GameController, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_GameControllerUpdate arginfo_SDL_PumpEvents

#define arginfo_SDL_GameControllerEventState arginfo_SDL_JoystickEventState

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_SDL_GameControllerAddMapping, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, mapping, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_SDL_GameControllerMapping arginfo_SDL_GameControllerName


ZEND_FUNCTION(SDL_GetTicks);
ZEND_FUNCTION(SDL_GetTicks64);
ZEND_FUNCTION(SDL_GetPerformanceCounter);
ZEND_FUNCTION(SDL_GetPerformanceFrequency);
ZEND_FUNCTION(SDL_PushEvent);
ZEND_FUNCTION(SDL_PumpEvents);
ZEND_FUNCTION(SDL_UpdateTexture);
ZEND_FUNCTION(SDL_LockTexture);
ZEND_FUNCTION(SDL_UnlockTexture);
ZEND_FUNCTION(SDL_SetTextureColorMod);
ZEND_FUNCTION(SDL_GetTextureColorMod);
ZEND_FUNCTION(SDL_SetTextureAlphaMod);
ZEND_FUNCTION(SDL_GetTextureAlphaMod);
ZEND_FUNCTION(SDL_SetTextureBlendMode);
ZEND_FUNCTION(SDL_GetTextureBlendMode);
ZEND_FUNCTION(SDL_SetTextureScaleMode);
ZEND_FUNCTION(SDL_GetTextureScaleMode);
ZEND_FUNCTION(SDL_RenderReadPixels);
ZEND_FUNCTION(SDL_JoystickUpdate);
ZEND_FUNCTION(SDL_JoystickNumAxes);
ZEND_FUNCTION(SDL_JoystickNumHats);
ZEND_FUNCTION(SDL_JoystickGetButton);
ZEND_FUNCTION(SDL_JoystickGetHat);
ZEND_FUNCTION(SDL_JoystickGetAttached);
ZEND_FUNCTION(SDL_JoystickInstanceID);
ZEND_FUNCTION(SDL_JoystickGetDeviceInstanceID);
ZEND_FUNCTION(SDL_JoystickEventState);
ZEND_FUNCTION(SDL_GameControllerOpen);
ZEND_FUNCTION(SDL_GameControllerClose);
ZEND_FUNCTION(SDL_GameControllerName);
ZEND_FUNCTION(SDL_GameControllerNameForIndex);
ZEND_FUNCTION(SDL_GameControllerGetAxis);
ZEND_FUNCTION(SDL_GameControllerGetButton);
ZEND_FUNCTION(SDL_GameControllerGetAttached);
ZEND_FUNCTION(SDL_GameControllerGetJoystick);
ZEND_FUNCTION(SDL_GameControllerUpdate);
ZEND_FUNCTION(SDL_GameControllerEventState);
ZEND_FUNCTION(SDL_GameControllerAddMapping);
ZEND_FUNCTION(SDL_GameControllerMapping);


static const zend_function_entry ext_functions[] = {
	ZEND_FE(SDL_GetTicks, arginfo_SDL_GetTicks)
	ZEND_FE(SDL_GetTicks64, arginfo_SDL_GetTicks64)
	ZEND_FE(SDL_GetPerformanceCounter, arginfo_SDL_GetPerformanceCounter)
	ZEND_FE(SDL_GetPerformanceFrequency, arginfo_SDL_GetPerformanceFrequency)
	ZEND_FE(SDL_PushEvent, arginfo_SDL_PushEvent)
	ZEND_FE(SDL_PumpEvents, arginfo_SDL_PumpEvents)
	ZEND_FE(SDL_UpdateTexture, arginfo_SDL_UpdateTexture)
	ZEND_FE(SDL_LockTexture, arginfo_SDL_LockTexture)
	ZEND_FE(SDL_UnlockTexture, arginfo_SDL_UnlockTexture)
	ZEND_FE(SDL_SetTextureColorMod, arginfo_SDL_SetTextureColorMod)
	ZEND_FE(SDL_GetTextureColorMod, arginfo_SDL_GetTextureColorMod)
	ZEND_FE(SDL_SetTextureAlphaMod, arginfo_SDL_SetTextureAlphaMod)
	ZEND_FE(SDL_GetTextureAlphaMod, arginfo_SDL_GetTextureAlphaMod)
	ZEND_FE(SDL_SetTextureBlendMode, arginfo_SDL_SetTextureBlendMode)
	ZEND_FE(SDL_GetTextureBlendMode, arginfo_SDL_GetTextureBlendMode)
	ZEND_FE(SDL_SetTextureScaleMode, arginfo_SDL_SetTextureScaleMode)
	ZEND_FE(SDL_GetTextureScaleMode, arginfo_SDL_GetTextureScaleMode)
	ZEND_FE(SDL_RenderReadPixels, arginfo_SDL_RenderReadPixels)
	ZEND_FE(SDL_JoystickUpdate, arginfo_SDL_JoystickUpdate)
	ZEND_FE(SDL_JoystickNumAxes, arginfo_SDL_JoystickNumAxes)
	ZEND_FE(SDL_JoystickNumHats, arginfo_SDL_JoystickNumHats)
	ZEND_FE(SDL_JoystickGetButton, arginfo_SDL_JoystickGetButton)
	ZEND_FE(SDL_JoystickGetHat, arginfo_SDL_JoystickGetHat)
	ZEND_FE(SDL_JoystickGetAttached, arginfo_SDL_JoystickGetAttached)
	ZEND_FE(SDL_JoystickInstanceID, arginfo_SDL_JoystickInstanceID)
	ZEND_FE(SDL_JoystickGetDeviceInstanceID, arginfo_SDL_JoystickGetDeviceInstanceID)
	ZEND_FE(SDL_JoystickEventState, arginfo_SDL_JoystickEventState)
	ZEND_FE(SDL_GameControllerOpen, arginfo_SDL_GameControllerOpen)
	ZEND_FE(SDL_GameControllerClose, arginfo_SDL_GameControllerClose)
	ZEND_FE(SDL_GameControllerName, arginfo_SDL_GameControllerName)
	ZEND_FE(SDL_GameControllerNameForIndex, arginfo_SDL_GameControllerNameForIndex)
	ZEND_FE(SDL_GameControllerGetAxis, arginfo_SDL_GameControllerGetAxis)
	ZEND_FE(SDL_GameControllerGetButton, arginfo_SDL_GameControllerGetButton)
	ZEND_FE(SDL_GameControllerGetAttached, arginfo_SDL_GameControllerGetAttached)
	ZEND_FE(SDL_GameControllerGetJoystick, arginfo_SDL_GameControllerGetJoystick)
	ZEND_FE(SDL_GameControllerUpdate, arginfo_SDL_GameControllerUpdate)
	ZEND_FE(SDL_GameControllerEventState, arginfo_SDL_GameControllerEventState)
	ZEND_FE(SDL_GameControllerAddMapping, arginfo_SDL_GameControllerAddMapping)
	ZEND_FE(SDL_GameControllerMapping, arginfo_SDL_GameControllerMapping)
	ZEND_FE_END
};
