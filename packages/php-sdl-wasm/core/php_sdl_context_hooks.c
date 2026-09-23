/* Native SDL teardown hooks. PHP License 3.01. */
#include "php_sdl_extra.h"

void __real_SDL_GL_DeleteContext(SDL_GLContext context);
void __real_SDL_VideoQuit(void);
int __real_SDL_VideoInit(const char *driver);
#ifdef __EMSCRIPTEN__
void php_sdl_bind_canvas(void);
#endif

static void (*context_cleanup)(SDL_GLContext);
static Uint64 generation;
static zend_bool video_changing;
static int (*audio_cleanup)(void);
static zend_bool audio_changing;

int php_sdl_video_transitioning(void) { return video_changing; }

void __real_SDL_AudioQuit(void);
int __real_SDL_AudioInit(const char *driver);

void php_sdl_audio_cleanup_register(int (*cleanup)(void))
{
	audio_cleanup = cleanup;
}

void __wrap_SDL_AudioQuit(void)
{
	if (audio_changing) { return; }
	audio_changing = 1;
	if (!audio_cleanup || audio_cleanup()) { __real_SDL_AudioQuit(); }
	audio_changing = 0;
}

int __wrap_SDL_AudioInit(const char *driver)
{
	/* Like video, direct AudioInit may call AudioQuit inside its own unit. */
	if (audio_changing) { return SDL_SetError("SDL audio teardown is in progress"); }
	audio_changing = 1;
	int result = -1;
	if (!audio_cleanup || audio_cleanup()) { result = __real_SDL_AudioInit(driver); }
	audio_changing = 0;
	return result;
}

void php_sdl_context_cleanup_register(void (*cleanup)(SDL_GLContext))
{
	context_cleanup = cleanup;
}

Uint64 php_sdl_context_generation(void) { return generation; }

void __wrap_SDL_GL_DeleteContext(SDL_GLContext context)
{
	if (context) {
		SDL_Window *window = php_sdl_context_window(context);
		if (!window) { window = php_sdl_renderer_context_window(context); }
		if (window) { SDL_GL_MakeCurrent(window, context); }
		if (context_cleanup) { context_cleanup(context); }
		php_sdl_context_invalidate(context);
		generation++;
	}
	__real_SDL_GL_DeleteContext(context);
}

static void video_cleanup(void)
{
	php_sdl_render_close(NULL);
	php_sdl_contexts_close(NULL);
	php_sdl_windows_invalidate(NULL);
	php_sdl_cursors_invalidate();
}

void __wrap_SDL_VideoQuit(void)
{
	if (video_changing) { return; }
	video_changing = 1;
	video_cleanup();
	__real_SDL_VideoQuit();
	video_changing = 0;
}

int __wrap_SDL_VideoInit(const char *driver)
{
	/* SDL_VideoInit calls SDL_VideoQuit inside the same translation unit. */
	if (video_changing) { return SDL_SetError("SDL video teardown is in progress"); }
	video_changing = 1;
	video_cleanup();
#ifdef __EMSCRIPTEN__
	php_sdl_bind_canvas();
#endif
	int result = __real_SDL_VideoInit(driver);
	video_changing = 0;
	return result;
}
