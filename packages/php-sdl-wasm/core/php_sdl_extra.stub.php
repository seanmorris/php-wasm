<?php
/** @generate-function-entries */

/** Unsigned counters return decimal strings when they exceed PHP_INT_MAX. */
function SDL_GetTicks(): int|string {}
function SDL_GetTicks64(): int|string {}
function SDL_GetPerformanceCounter(): int|string {}
function SDL_GetPerformanceFrequency(): int|string {}
function SDL_PushEvent(SDL_Event $event): int {}
function SDL_PumpEvents(): void {}

/** @param resource $texture */
function SDL_UpdateTexture($texture, ?SDL_Rect $rect, string|SDL_Pixels $pixels, int $pitch): int {}
/** @param resource $texture */
function SDL_LockTexture($texture, ?SDL_Rect $rect, ?SDL_Pixels &$pixels, ?int &$pitch): int {}
/** @param resource $texture */
function SDL_UnlockTexture($texture): void {}
/** @param resource $texture */
function SDL_SetTextureColorMod($texture, int $red, int $green, int $blue): int {}
/** @param resource $texture */
function SDL_GetTextureColorMod($texture, ?int &$red, ?int &$green, ?int &$blue): int {}
/** @param resource $texture */
function SDL_SetTextureAlphaMod($texture, int $alpha): int {}
/** @param resource $texture */
function SDL_GetTextureAlphaMod($texture, ?int &$alpha): int {}
/** @param resource $texture */
function SDL_SetTextureBlendMode($texture, int $mode): int {}
/** @param resource $texture */
function SDL_GetTextureBlendMode($texture, ?int &$mode): int {}
/** @param resource $texture */
function SDL_SetTextureScaleMode($texture, int $mode): int {}
/** @param resource $texture */
function SDL_GetTextureScaleMode($texture, ?int &$mode): int {}
/** @param resource $renderer */
function SDL_RenderReadPixels($renderer, ?SDL_Rect $rect, int $format): ?string {}

function SDL_JoystickUpdate(): void {}
function SDL_JoystickNumAxes(SDL_Joystick $joystick): int {}
function SDL_JoystickNumHats(SDL_Joystick $joystick): int {}
function SDL_JoystickGetButton(SDL_Joystick $joystick, int $button): int {}
function SDL_JoystickGetHat(SDL_Joystick $joystick, int $hat): int {}
function SDL_JoystickGetAttached(SDL_Joystick $joystick): bool {}
function SDL_JoystickInstanceID(SDL_Joystick $joystick): int {}
function SDL_JoystickGetDeviceInstanceID(int $index): int {}
function SDL_JoystickEventState(int $state): int {}
function SDL_GameControllerOpen(int $index): ?SDL_GameController {}
function SDL_GameControllerClose(SDL_GameController $controller): void {}
function SDL_GameControllerName(SDL_GameController $controller): ?string {}
function SDL_GameControllerNameForIndex(int $index): ?string {}
function SDL_GameControllerGetAxis(SDL_GameController $controller, int $axis): int {}
function SDL_GameControllerGetButton(SDL_GameController $controller, int $button): int {}
function SDL_GameControllerGetAttached(SDL_GameController $controller): bool {}
function SDL_GameControllerGetJoystick(SDL_GameController $controller): ?SDL_Joystick {}
function SDL_GameControllerUpdate(): void {}
function SDL_GameControllerEventState(int $state): int {}
function SDL_GameControllerAddMapping(string $mapping): int {}
function SDL_GameControllerMapping(SDL_GameController $controller): ?string {}
