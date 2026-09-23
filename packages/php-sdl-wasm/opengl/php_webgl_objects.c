/* GL names must be released before Emscripten drops its context record.
 * The browser can return the same WebGL context for the next SDL window.
 * PHP License 3.01. */
#include "php_webgl.h"

extern void php_sdl_context_cleanup_register(void (*cleanup)(SDL_GLContext));
extern Uint64 php_sdl_context_generation(void);
#ifdef __EMSCRIPTEN__
extern void php_webgl_track_epoch(int type, GLuint object);
extern void php_webgl_prepare_delete(int type, GLsizei count, GLuint *ids);
#endif

static HashTable objects[PHP_WEBGL_OBJECT_TYPES];

void php_webgl_object_track(php_webgl_object_type type, GLuint object)
{
	if (object) {
		zend_hash_index_update_ptr(&objects[type], object, SDL_GL_GetCurrentContext());
#ifdef __EMSCRIPTEN__
		php_webgl_track_epoch(type, object);
#endif
	}
}

void php_webgl_object_forget(php_webgl_object_type type, GLuint object)
{
	zend_hash_index_del(&objects[type], object);
}

static void delete_objects(php_webgl_object_type type, GLsizei count, GLuint *ids)
{
	for (GLsizei i = 0; i < count; i++) { php_webgl_object_forget(type, ids[i]); }
#ifdef __EMSCRIPTEN__
	/* Forget lost-generation JS names without deleting them in a restored
	 * browser context. The helper zeroes those IDs in this private C array. */
	php_webgl_prepare_delete(type, count, ids);
#endif
	switch (type) {
	case PHP_WEBGL_VERTEX_ARRAY: glDeleteVertexArrays(count, ids); break;
	case PHP_WEBGL_FRAMEBUFFER: glDeleteFramebuffers(count, ids); break;
	case PHP_WEBGL_RENDERBUFFER: glDeleteRenderbuffers(count, ids); break;
	case PHP_WEBGL_TEXTURE: glDeleteTextures(count, ids); break;
	case PHP_WEBGL_BUFFER: glDeleteBuffers(count, ids); break;
	case PHP_WEBGL_SAMPLER: glDeleteSamplers(count, ids); break;
	case PHP_WEBGL_PROGRAM: for (GLsizei i = 0; i < count; i++) { glDeleteProgram(ids[i]); } break;
	case PHP_WEBGL_SHADER: for (GLsizei i = 0; i < count; i++) { glDeleteShader(ids[i]); } break;
	default: break;
	}
}

void php_webgl_delete_object(php_webgl_object_type type, GLuint object)
{
	delete_objects(type, 1, &object);
}

static void context_cleanup(SDL_GLContext context)
{
	/* A failed native renderer constructor may delete a context that was never
	 * made current or exposed to PHP, so it cannot own any of these names. */
	if (SDL_GL_GetCurrentContext() != context) { return; }
	/* Release a current program before deletion, including attached shaders that
	 * were already flagged for deletion. Container objects go before storage. */
	glUseProgram(0);
	for (int type = 0; type < PHP_WEBGL_OBJECT_TYPES; type++) {
		zend_ulong key;
		void *owner;
		ZEND_HASH_FOREACH_NUM_KEY_PTR(&objects[type], key, owner) {
			if (owner == context) {
				GLuint object = key;
				delete_objects(type, 1, &object);
			}
		} ZEND_HASH_FOREACH_END();
	}
}

void php_webgl_objects_init(void)
{
	for (int type = 0; type < PHP_WEBGL_OBJECT_TYPES; type++) {
		zend_hash_init(&objects[type], 0, NULL, NULL, 1);
	}
	php_sdl_context_cleanup_register(context_cleanup);
}

void php_webgl_objects_shutdown(void)
{
	php_sdl_context_cleanup_register(NULL);
	for (int type = 0; type < PHP_WEBGL_OBJECT_TYPES; type++) { zend_hash_destroy(&objects[type]); }
}

zend_bool php_webgl_shader(zend_long object)
{
	if (object <= 0 || (uint64_t)object > UINT_MAX || !glIsShader(object)) {
		zend_value_error("shader must name a live shader in the current context"); return 0;
	}
	return 1;
}

zend_bool php_webgl_program(zend_long object)
{
	if (object <= 0 || (uint64_t)object > UINT_MAX || !glIsProgram(object)) {
		zend_value_error("program must name a live program in the current context"); return 0;
	}
	return 1;
}

void php_webgl_generate(INTERNAL_FUNCTION_PARAMETERS, php_webgl_object_type type)
{
	zend_long count; zval *output; PARSE("lz", &count, &output);
	if ((type == PHP_WEBGL_RENDERBUFFER || type == PHP_WEBGL_SAMPLER) && !php_webgl_require_3()) { RETURN_THROWS(); }
	if (!nonnegative(count, "count")) { RETURN_THROWS(); }
	GLuint *ids = ecalloc((size_t)count, sizeof(*ids));
	SDL_GLContext context = SDL_GL_GetCurrentContext();
	SDL_Window *window = SDL_GL_GetCurrentWindow();
	Uint64 generation = php_sdl_context_generation();
	switch (type) {
	case PHP_WEBGL_VERTEX_ARRAY: glGenVertexArrays(count, ids); break;
	case PHP_WEBGL_FRAMEBUFFER: glGenFramebuffers(count, ids); break;
	case PHP_WEBGL_RENDERBUFFER: glGenRenderbuffers(count, ids); break;
	case PHP_WEBGL_TEXTURE: glGenTextures(count, ids); break;
	case PHP_WEBGL_BUFFER: glGenBuffers(count, ids); break;
	case PHP_WEBGL_SAMPLER: glGenSamplers(count, ids); break;
	default: break;
	}
	zval result; array_init(&result);
	for (zend_long i = 0; i < count; i++) {
		php_webgl_object_track(type, ids[i]);
		add_next_index_long(&result, ids[i]);
	}
	/* Replacing a PHP output value can run a destructor that destroys the context.
	 * Register first, and never delete these names in a replacement context. */
	ZEND_TRY_ASSIGN_REF_COPY(output, &result);
	zval_ptr_dtor(&result);
	zend_bool changed = generation != php_sdl_context_generation() || context != SDL_GL_GetCurrentContext();
	if (EG(exception) || changed) {
		if (generation == php_sdl_context_generation()) {
			SDL_GLContext previous = SDL_GL_GetCurrentContext();
			SDL_Window *previous_window = SDL_GL_GetCurrentWindow();
			if (previous == context || SDL_GL_MakeCurrent(window, context) == 0) {
				delete_objects(type, count, ids);
				if (previous != context) { SDL_GL_MakeCurrent(previous_window, previous); }
			}
		}
		efree(ids);
		if (!EG(exception)) { zend_throw_error(NULL, "SDL GL context changed while assigning generated handles"); }
		RETURN_THROWS();
	}
	efree(ids); RETURN_TRUE;
}

void php_webgl_delete(INTERNAL_FUNCTION_PARAMETERS, php_webgl_object_type type)
{
	zend_long count; zval *values, *entry; PARSE("la", &count, &values);
	if ((type == PHP_WEBGL_RENDERBUFFER || type == PHP_WEBGL_SAMPLER) && !php_webgl_require_3()) { RETURN_THROWS(); }
	if (!nonnegative(count, "count")) { RETURN_THROWS(); }
	if ((zend_ulong)count != zend_hash_num_elements(Z_ARRVAL_P(values))) {
		zend_value_error("count must match the number of handles"); RETURN_THROWS();
	}
	GLuint *ids = safe_emalloc((size_t)count, sizeof(*ids), 0); size_t index = 0;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), entry) {
		ZVAL_DEREF(entry);
		if (Z_TYPE_P(entry) != IS_LONG || Z_LVAL_P(entry) < 0 || (uint64_t)Z_LVAL_P(entry) > UINT_MAX) {
			efree(ids); zend_value_error("handles must be unsigned integers"); RETURN_THROWS();
		}
		ids[index++] = Z_LVAL_P(entry);
	} ZEND_HASH_FOREACH_END();
	delete_objects(type, count, ids); efree(ids);
}
