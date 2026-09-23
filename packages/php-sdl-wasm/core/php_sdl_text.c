/* Browser text input lifecycle. PHP License 3.01. */
#include <SDL.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

/* Internal senders from the pinned SDL_keyboard.c preserve native filtering,
 * event masks and codepoint-safe splitting of long committed strings. */
extern int SDL_SendKeyboardText(const char *text);
extern int SDL_SendEditingText(const char *text, int start, int length);
extern int php_sdl_video_transitioning(void);
extern void php_sdl_text_attach(unsigned int id);
extern void php_sdl_text_start(void);
extern void php_sdl_text_stop(void);
extern void php_sdl_text_detach(unsigned int id);
extern void php_sdl_text_rect(int x, int y, int w, int h);

void __real_SDL_StartTextInput(void);
void __real_SDL_StopTextInput(void);
void __real_SDL_SetTextInputRect(const SDL_Rect *rect);

void __wrap_SDL_StartTextInput(void)
{
	__real_SDL_StartTextInput();
	/* Ignore SDL's implicit start during video initialization. An explicit
	 * request remains armed even when its window has not been created yet. */
	if (!php_sdl_video_transitioning()) { php_sdl_text_start(); }
}

void __wrap_SDL_StopTextInput(void)
{
	php_sdl_text_stop();
	__real_SDL_StopTextInput();
}

void __wrap_SDL_SetTextInputRect(const SDL_Rect *rect)
{
	__real_SDL_SetTextInputRect(rect);
	if (rect) { php_sdl_text_rect(rect->x, rect->y, rect->w, rect->h); }
}

/* Browser callbacks carry an SDL ID, not a pointer that can outlive a window. */
EMSCRIPTEN_KEEPALIVE int php_sdl_text_send(Uint32 id, const char *text, int editing, int start, int length)
{
	SDL_Window *window = SDL_GetKeyboardFocus();
	if (!text || !window || SDL_GetWindowID(window) != id || !SDL_IsTextInputActive()) { return 0; }
	if (!(SDL_GetWindowFlags(window) & SDL_WINDOW_INPUT_FOCUS) && (!editing || *text)) { return 0; }
	return editing ? SDL_SendEditingText(text, start, length) : SDL_SendKeyboardText(text);
}

EMSCRIPTEN_KEEPALIVE int php_sdl_text_size(Uint32 id, int axis)
{
	SDL_Window *window = SDL_GetWindowFromID(id);
	int width = 0, height = 0;
	if (window) { SDL_GetWindowSize(window, &width, &height); }
	return axis ? height : width;
}

EMSCRIPTEN_KEEPALIVE void php_sdl_text_unavailable(void)
{
	SDL_SetError("Browser IME input on a fullscreen canvas requires EditContext support");
}
#endif

void php_sdl_text_window(SDL_Window *window)
{
#ifdef __EMSCRIPTEN__
	if (window) { php_sdl_text_attach(SDL_GetWindowID(window)); }
#endif
}

void php_sdl_text_cleanup(SDL_Window *window)
{
#ifdef __EMSCRIPTEN__
	php_sdl_text_detach(window ? SDL_GetWindowID(window) : 0);
#endif
}
