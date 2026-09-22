/*
  +----------------------------------------------------------------------+
  | Copyright (c) 1997-2018 The PHP Group                                |
  +----------------------------------------------------------------------+
  | This source file is subject to version 3.01 of the PHP license,      |
  | that is bundled with this package in the file LICENSE, and is        |
  | available through the world-wide-web at the following url:           |
  | https://www.php.net/license/3_01.txt                                 |
  | If you did not receive a copy of the PHP license and are unable to   |
  | obtain it through the world-wide-web, please send a note to          |
  | license@php.net so we can mail you a copy immediately.               |
  +----------------------------------------------------------------------+
  | Authors: Santiago Lizardo <santiagolizardo@php.net>                  |
  |          Remi Collet <remi@php.net>                                  |
  +----------------------------------------------------------------------+
*/


#include "rwops.h"
#include "php_sdl_extra.h"
#include "zend_interfaces.h"
#include "ext/standard/file.h"
#include <limits.h>

static zend_class_entry *php_sdl_rwops_ce;
static zend_object_handlers php_sdl_rwops_handlers;
struct php_sdl_rwops {
	SDL_RWops *rwops;
	Uint32 flags;
	char *buf;
	size_t capacity;
	zend_bool initialized, busy, autoclose;
	/* Contiguous owners are also reported to PHP's cycle collector. */
	zval owners[2]; /* PHP stream resource, writable buffer reference */
	zend_object zo;
};

static struct php_sdl_rwops *rwops_object(zend_object *object)
{
	return (struct php_sdl_rwops *)((char *)object - XtOffsetOf(struct php_sdl_rwops, zo));
}

zend_class_entry *get_php_sdl_rwops_ce(void)
{
	return php_sdl_rwops_ce;
}

zend_bool sdl_rwops_to_zval(SDL_RWops *rwops, zval *value, Uint32 flags, char *buf)
{
	if (!rwops) {
		if (buf) { efree(buf); }
		ZVAL_NULL(value);
		return 0;
	}
	object_init_ex(value, php_sdl_rwops_ce);
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(value));
	intern->rwops = rwops;
	intern->flags = flags;
	intern->buf = buf;
	intern->initialized = 1;
	zend_update_property_long(php_sdl_rwops_ce, &intern->zo, ZEND_STRL("type"), rwops->type);
	return 1;
}

SDL_RWops *zval_to_sdl_rwops(zval *value)
{
	ZVAL_DEREF(value);
	if (Z_TYPE_P(value) != IS_OBJECT || !instanceof_function(Z_OBJCE_P(value), php_sdl_rwops_ce)) {
		zend_type_error("expected SDL_RWops");
		return NULL;
	}
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(value));
	if (!intern->rwops) {
		zend_throw_error(NULL, "SDL_RWops has been closed");
		return NULL;
	}
	if (intern->busy) {
		zend_throw_error(NULL, "SDL_RWops cannot be used recursively during stream I/O");
		return NULL;
	}
	if (!intern->rwops->close) {
		zend_throw_error(NULL, "Raw SDL_RWops has no I/O callbacks; use an SDL_RWFrom factory");
		return NULL;
	}
	if (!Z_ISUNDEF(intern->owners[1])) {
		zval *buffer = &intern->owners[1];
		ZVAL_DEREF(buffer);
		if (Z_TYPE_P(buffer) != IS_STRING || Z_STRLEN_P(buffer) != intern->capacity) {
			zend_value_error("SDL_RWFromMem buffer must remain a string of its original capacity");
			return NULL;
		}
		memcpy(intern->buf, Z_STRVAL_P(buffer), intern->capacity);
	}
	return intern->rwops;
}

/* Publish a fresh PHP string, never a mutable native pointer into shared string
 * storage. Pin the reference because replacing its value can execute PHP. */
void php_sdl_rwops_flush(zval *value)
{
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(value));
	if (Z_ISUNDEF(intern->owners[1]) || !intern->rwops) { return; }
	zval reference, buffer;
	ZVAL_COPY(&reference, &intern->owners[1]);
	ZVAL_STRINGL(&buffer, intern->buf, intern->capacity);
	ZEND_TRY_ASSIGN_REF_COPY(&reference, &buffer);
	zval_ptr_dtor(&buffer);
	zval_ptr_dtor(&reference);
}

static int rwops_close(struct php_sdl_rwops *intern)
{
	if (!intern->rwops) { return 0; }
	if (intern->busy) {
		zend_throw_error(NULL, "SDL_RWops cannot be closed during stream I/O");
		return -1;
	}
	SDL_RWops *rwops = intern->rwops;
	char *buf = intern->buf;
	/* Invalidate aliases before a PHP stream's close callback can run. */
	intern->rwops = NULL;
	intern->buf = NULL;
	int result = 0;
	if (rwops && !(intern->flags & SDL_DONTFREE)) {
		if (rwops->close) { result = SDL_RWclose(rwops); }
		else { SDL_FreeRW(rwops); }
	}
	if (buf) { efree(buf); }
	zval owners[2];
	for (int i = 0; i < 2; i++) {
		ZVAL_COPY_VALUE(&owners[i], &intern->owners[i]);
		ZVAL_UNDEF(&intern->owners[i]);
	}
	for (int i = 0; i < 2; i++) { zval_ptr_dtor(&owners[i]); }
	return result;
}

int php_sdl_rwops_close(zval *value)
{
	return rwops_close(rwops_object(Z_OBJ_P(value)));
}

static void php_sdl_rwops_free(zend_object *object)
{
	rwops_close(rwops_object(object));
	zend_object_std_dtor(object);
}

static HashTable *rwops_gc(zend_object *object, zval **table, int *count)
{
	*table = rwops_object(object)->owners;
	*count = 2;
	return zend_std_get_properties(object);
}

static zend_object *php_sdl_rwops_new(zend_class_entry *class_type)
{
	struct php_sdl_rwops *intern = zend_object_alloc(sizeof(*intern), class_type);
	intern->rwops = NULL;
	intern->flags = 0;
	intern->buf = NULL;
	intern->capacity = 0;
	intern->initialized = intern->busy = intern->autoclose = 0;
	ZVAL_UNDEF(&intern->owners[0]);
	ZVAL_UNDEF(&intern->owners[1]);
	zend_object_std_init(&intern->zo, class_type);
	object_properties_init(&intern->zo, class_type);
	intern->zo.handlers = &php_sdl_rwops_handlers;
	return &intern->zo;
}

static PHP_METHOD(SDL_RWops, __construct)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(getThis()));
	if (intern->initialized) { zend_throw_error(NULL, "SDL_RWops cannot be reinitialized"); RETURN_THROWS(); }
	intern->initialized = 1;
	intern->rwops = SDL_AllocRW();
	if (!intern->rwops) { zend_throw_error(NULL, "%s", SDL_GetError()); RETURN_THROWS(); }
	SDL_zero(*intern->rwops);
}

static PHP_METHOD(SDL_RWops, __toString)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(getThis()));
	const char *type = "closed";
	if (intern->rwops) {
		switch (intern->rwops->type) {
			case SDL_RWOPS_STDFILE: type = "Stdio file"; break;
			case SDL_RWOPS_MEMORY: type = "Memory stream"; break;
			case SDL_RWOPS_MEMORY_RO: type = "Read only memory stream"; break;
			default: type = intern->rwops->close ? "PHP stream" : "uninitialized";
		}
	}
	RETURN_STR(strpprintf(0, "SDL_RWops(%s)", type));
}

PHP_FUNCTION(SDL_AllocRW)
{
	if (zend_parse_parameters_none() == FAILURE) { RETURN_THROWS(); }
	SDL_RWops *rwops = SDL_AllocRW();
	if (rwops) { SDL_zero(*rwops); }
	sdl_rwops_to_zval(rwops, return_value, 0, NULL);
}

PHP_FUNCTION(SDL_RWFromFile)
{
	char *path, *mode; size_t path_len, mode_len;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "ps", &path, &path_len, &mode, &mode_len) == FAILURE) { RETURN_THROWS(); }
	if (!mode_len || memchr(mode, 0, mode_len)) { zend_value_error("mode must be a nonempty string without NUL bytes"); RETURN_THROWS(); }
	sdl_rwops_to_zval(SDL_RWFromFile(path, mode), return_value, 0, NULL);
}

PHP_FUNCTION(SDL_RWFromConstMem)
{
	char *buf; size_t length; zend_long size = 0;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "s|l", &buf, &length, &size) == FAILURE) { RETURN_THROWS(); }
	if (ZEND_NUM_ARGS() == 1) {
		if (length > INT_MAX) { zend_value_error("buffer capacity must fit int32"); RETURN_THROWS(); }
		size = length;
	}
	if (size <= 0 || size > INT_MAX || (size_t)size > length) {
		zend_value_error("size must be positive and no larger than the supplied buffer or INT_MAX"); RETURN_THROWS();
	}
	char *copy = estrndup(buf, size);
	sdl_rwops_to_zval(SDL_RWFromConstMem(copy, size), return_value, 0, copy);
}

PHP_FUNCTION(SDL_RWFromMem)
{
	zval *reference; zend_long size;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "zl", &reference, &size) == FAILURE) { RETURN_THROWS(); }
	zval *buffer = reference;
	ZVAL_DEREF(buffer);
	if (Z_TYPE_P(buffer) != IS_STRING) { zend_type_error("buffer must be a string"); RETURN_THROWS(); }
	if (size <= 0 || size > INT_MAX) { zend_value_error("buffer capacity must be positive and fit int32"); RETURN_THROWS(); }
	char *copy = ecalloc(size, 1);
	memcpy(copy, Z_STRVAL_P(buffer), MIN((size_t)size, Z_STRLEN_P(buffer)));
	if (!sdl_rwops_to_zval(SDL_RWFromMem(copy, size), return_value, 0, copy)) { return; }
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(return_value));
	intern->capacity = size;
	ZVAL_COPY(&intern->owners[1], reference);
	php_sdl_rwops_flush(return_value);
	if (EG(exception)) { zval_ptr_dtor(return_value); RETURN_THROWS(); }
}

/* PHP stream callbacks retain the resource and check it on every entry. PHP's
 * fclose guard handles ordinary reentrancy; pclose bypasses that guard. Defer
 * native stream destruction with the core recursion guard until I/O unwinds,
 * then release a resource closed by pclose. */
typedef struct {
	struct php_sdl_rwops *owner;
	php_stream *stream;
	uint32_t no_fclose;
} rwops_stream_call;

static php_stream *stream_enter(SDL_RWops *rwops, rwops_stream_call *call)
{
	if (EG(exception)) { return NULL; }
	struct php_sdl_rwops *intern = rwops->hidden.unknown.data1;
	zval *resource = &intern->owners[0];
	if (intern->busy || Z_TYPE_P(resource) != IS_RESOURCE
		|| (Z_RES_P(resource)->type != php_file_le_stream() && Z_RES_P(resource)->type != php_file_le_pstream())) {
		zend_throw_error(NULL, "PHP stream is closed or already performing I/O");
		return NULL;
	}
	php_stream *stream = Z_RES_P(resource)->ptr;
	if (!stream || stream->in_free) { zend_throw_error(NULL, "PHP stream is closing or already performing I/O"); return NULL; }
	call->owner = intern;
	call->stream = stream;
	call->no_fclose = stream->flags & PHP_STREAM_FLAG_NO_FCLOSE;
	stream->flags |= PHP_STREAM_FLAG_NO_FCLOSE;
	stream->in_free = 2; /* Block enclosed-stream recursion as well as direct free. */
	intern->busy = 1;
	return stream;
}

static void stream_leave(rwops_stream_call *call)
{
	php_stream *stream = call->stream;
	stream->flags = (stream->flags & ~PHP_STREAM_FLAG_NO_FCLOSE) | call->no_fclose;
	stream->in_free = 0;
	if (Z_RES(call->owner->owners[0])->type < 0) {
		php_stream_free(stream, PHP_STREAM_FREE_CLOSE | PHP_STREAM_FREE_RSRC_DTOR);
		if (!EG(exception)) { zend_throw_error(NULL, "PHP stream was closed during SDL I/O"); }
	}
	call->owner->busy = 0;
}

static Sint64 SDLCALL stream_size(SDL_RWops *rwops)
{
	rwops_stream_call call; php_stream_statbuf stat;
	php_stream *stream = stream_enter(rwops, &call);
	if (!stream) { return -1; }
	int result = php_stream_stat(stream, &stat);
	stream_leave(&call);
	return result == 0 && !EG(exception) ? stat.sb.st_size : -1;
}

static Sint64 SDLCALL stream_seek(SDL_RWops *rwops, Sint64 offset, int whence)
{
	rwops_stream_call call;
	php_stream *stream = stream_enter(rwops, &call);
	if (!stream) { return -1; }
	Sint64 result = -1;
	if (php_stream_seek(stream, offset, whence) == 0 && !EG(exception)) { result = php_stream_tell(stream); }
	stream_leave(&call);
	return EG(exception) ? -1 : result;
}

static size_t SDLCALL stream_read(SDL_RWops *rwops, void *ptr, size_t size, size_t count)
{
	if (!size || !count) { return 0; }
	if (size > INT_MAX / count) { SDL_SetError("SDL stream read exceeds INT_MAX bytes"); return 0; }
	rwops_stream_call call;
	php_stream *stream = stream_enter(rwops, &call);
	if (!stream) { return 0; }
	ssize_t result = php_stream_read(stream, ptr, size * count);
	stream_leave(&call);
	return result > 0 && !EG(exception) ? (size_t)result / size : 0;
}

static size_t SDLCALL stream_write(SDL_RWops *rwops, const void *ptr, size_t size, size_t count)
{
	if (!size || !count) { return 0; }
	if (size > INT_MAX / count) { SDL_SetError("SDL stream write exceeds INT_MAX bytes"); return 0; }
	rwops_stream_call call;
	php_stream *stream = stream_enter(rwops, &call);
	if (!stream) { return 0; }
	ssize_t result = php_stream_write(stream, ptr, size * count);
	stream_leave(&call);
	return result > 0 && !EG(exception) ? (size_t)result / size : 0;
}

static int SDLCALL stream_close(SDL_RWops *rwops)
{
	struct php_sdl_rwops *intern = rwops->hidden.unknown.data1;
	SDL_FreeRW(rwops);
	if (intern->autoclose && Z_TYPE(intern->owners[0]) == IS_RESOURCE) {
		/* Resource closure marks aliases invalid before invoking PHP callbacks. */
		zend_list_close(Z_RES(intern->owners[0]));
	}
	return EG(exception) ? -1 : 0;
}

void php_stream_to_zval_rwops(php_stream *stream, zval *value, int autoclose)
{
	if (!stream) { ZVAL_NULL(value); return; }
	SDL_RWops *rwops = SDL_AllocRW();
	if (!rwops) { ZVAL_NULL(value); return; }
	SDL_zero(*rwops);
	rwops->size = stream_size;
	rwops->seek = stream_seek;
	rwops->read = stream_read;
	rwops->write = stream_write;
	rwops->close = stream_close;
	sdl_rwops_to_zval(rwops, value, 0, NULL);
	struct php_sdl_rwops *intern = rwops_object(Z_OBJ_P(value));
	intern->autoclose = autoclose != 0;
	ZVAL_RES(&intern->owners[0], stream->res);
	GC_ADDREF(stream->res);
	php_stream_auto_cleanup(stream);
	rwops->hidden.unknown.data1 = intern;
}

PHP_FUNCTION(SDL_RWFromFP)
{
	zval *value; zend_bool autoclose = 0; php_stream *stream;
	if (zend_parse_parameters(ZEND_NUM_ARGS(), "r|b", &value, &autoclose) == FAILURE) { RETURN_THROWS(); }
	php_stream_from_zval(stream, value);
	php_stream_to_zval_rwops(stream, return_value, autoclose);
}

PHP_FUNCTION(SDL_FreeRW)
{
	zval *value;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_rwops_ce) == FAILURE) { RETURN_THROWS(); }
	php_sdl_rwops_close(value);
	if (EG(exception)) { RETURN_THROWS(); }
}

PHP_FUNCTION(SDL_RWclose)
{
	zval *value;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_rwops_ce) == FAILURE) { RETURN_THROWS(); }
	int result = php_sdl_rwops_close(value);
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

#define FETCH_RWOPS(ptr, value, check) \
	ptr = zval_to_sdl_rwops(value); \
	if (!ptr) { RETURN_THROWS(); }

static zend_bool rwops_length(zend_long size, zend_long count)
{
	if (size < 0 || count < 0 || size > INT_MAX || count > INT_MAX || (count && size > INT_MAX / count)) {
		zend_value_error("size and count must be nonnegative and their product must fit int32");
		return 0;
	}
	return 1;
}

PHP_FUNCTION(SDL_RWsize)
{
	zval *value; SDL_RWops *rwops;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_rwops_ce) == FAILURE) { RETURN_THROWS(); }
	FETCH_RWOPS(rwops, value, 1);
	Sint64 result = SDL_RWsize(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	if (result < 0) { RETURN_LONG(-1); }
	php_sdl_uint64(return_value, result);
}

PHP_FUNCTION(SDL_RWtell)
{
	zval *value; SDL_RWops *rwops;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &value, php_sdl_rwops_ce) == FAILURE) { RETURN_THROWS(); }
	FETCH_RWOPS(rwops, value, 1);
	Sint64 result = SDL_RWtell(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	if (result < 0) { RETURN_LONG(-1); }
	php_sdl_uint64(return_value, result);
}

PHP_FUNCTION(SDL_RWseek)
{
	zval *value; SDL_RWops *rwops; zend_long offset, whence;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Oll", &value, php_sdl_rwops_ce, &offset, &whence) == FAILURE) { RETURN_THROWS(); }
	if (whence != RW_SEEK_SET && whence != RW_SEEK_CUR && whence != RW_SEEK_END) { zend_value_error("invalid seek origin"); RETURN_THROWS(); }
	FETCH_RWOPS(rwops, value, 1);
	Sint64 result = SDL_RWseek(rwops, offset, whence);
	if (EG(exception)) { RETURN_THROWS(); }
	if (result < 0) { RETURN_LONG(-1); }
	php_sdl_uint64(return_value, result);
}

PHP_FUNCTION(SDL_RWread)
{
	zval *value, *output; SDL_RWops *rwops; zend_long size, count = 0;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ozl|l", &value, php_sdl_rwops_ce, &output, &size, &count) == FAILURE) { RETURN_THROWS(); }
	int argc = ZEND_NUM_ARGS() + (execute_data->func->common.scope && getThis() ? 1 : 0);
	if (argc == 3) { count = size; size = 1; }
	if (!rwops_length(size, count)) { RETURN_THROWS(); }
	FETCH_RWOPS(rwops, value, 1);
	zend_string *buffer = zend_string_alloc(size * count, 0);
	size_t result = size && count ? SDL_RWread(rwops, ZSTR_VAL(buffer), size, count) : 0;
	if (EG(exception)) { zend_string_release(buffer); RETURN_THROWS(); }
	ZSTR_LEN(buffer) = result * size;
	ZSTR_VAL(buffer)[ZSTR_LEN(buffer)] = 0;
	zval bytes;
	ZVAL_STR(&bytes, buffer);
	ZEND_TRY_ASSIGN_REF_COPY(output, &bytes);
	zval_ptr_dtor(&bytes);
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

PHP_FUNCTION(SDL_RWwrite)
{
	zval *value; char *buf; size_t length; SDL_RWops *rwops; zend_long size = 0, count = 0;
	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Os|ll", &value, php_sdl_rwops_ce, &buf, &length, &size, &count) == FAILURE) { RETURN_THROWS(); }
	int argc = ZEND_NUM_ARGS() + (execute_data->func->common.scope && getThis() ? 1 : 0);
	if (argc == 2) {
		if (length > INT_MAX) { zend_value_error("buffer length must fit int32"); RETURN_THROWS(); }
		count = length; size = 1;
	} else if (argc == 3) { count = size; size = 1; }
	if (!rwops_length(size, count)) { RETURN_THROWS(); }
	if ((size_t)(size * count) > length) { zend_value_error("input buffer is too short for size and count"); RETURN_THROWS(); }
	FETCH_RWOPS(rwops, value, 1);
	size_t result = size && count ? SDL_RWwrite(rwops, buf, size, count) : 0;
	if (!EG(exception)) { php_sdl_rwops_flush(value); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}

/* {{{ proto int SDL_ReadU8(SDL_RWops area)

 *  \name Read endian functions
 *
 *  Read an item of the specified endianness and return in native format.
 extern DECLSPEC Uint8 SDLCALL SDL_ReadU8(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadU8)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint8 result = SDL_ReadU8(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */


/* {{{ proto int SDL_ReadLE16(SDL_RWops area)

 extern DECLSPEC Uint16 SDLCALL SDL_ReadLE16(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadLE16)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint16 result = SDL_ReadLE16(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */


/* {{{ proto int SDL_ReadBE16(SDL_RWops area)

 extern DECLSPEC Uint16 SDLCALL SDL_ReadBE16(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadBE16)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint16 result = SDL_ReadBE16(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */


/* {{{ proto int SDL_ReadLE32(SDL_RWops area)

extern DECLSPEC Uint32 SDLCALL SDL_ReadLE32(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadLE32)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint32 result = SDL_ReadLE32(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */


/* {{{ proto int SDL_ReadBE32(SDL_RWops area)

extern DECLSPEC Uint32 SDLCALL SDL_ReadBE32(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadBE32)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint32 result = SDL_ReadBE32(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */


#if SIZEOF_LONG > 4
/* {{{ proto int SDL_ReadLE64(SDL_RWops area)

extern DECLSPEC Uint64 SDLCALL SDL_ReadLE64(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadLE64)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint64 result = SDL_ReadLE64(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */


/* {{{ proto int SDL_ReadBE64(SDL_RWops area)

 extern DECLSPEC Uint64 SDLCALL SDL_ReadBE64(SDL_RWops * src);
 */
PHP_FUNCTION(SDL_ReadBE64)
{
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "O", &z_rwops, php_sdl_rwops_ce) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	Uint64 result = SDL_ReadBE64(rwops);
	if (EG(exception)) { RETURN_THROWS(); }
	php_sdl_uint64(return_value, result);
}
/* }}} */
#endif

/* {{{ proto int SDL_WriteU8(SDL_RWops area, int value)

 *  \name Write endian functions
 *
 *  Write an item of native format to the specified endianness.
 extern DECLSPEC size_t SDLCALL SDL_WriteU8(SDL_RWops * dst, Uint8 value);
 */
PHP_FUNCTION(SDL_WriteU8)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteU8(rwops, (Uint8)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */


/* {{{ proto int SDL_WriteLE16(SDL_RWops area, int value)

 extern DECLSPEC size_t SDLCALL SDL_WriteLE16(SDL_RWops * dst, Uint16 value);
 */
PHP_FUNCTION(SDL_WriteLE16)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteLE16(rwops, (Uint16)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */



/* {{{ proto int SDL_WriteBE16(SDL_RWops area, int value)

 extern DECLSPEC size_t SDLCALL SDL_WriteBE16(SDL_RWops * dst, Uint16 value);
 */
PHP_FUNCTION(SDL_WriteBE16)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteBE16(rwops, (Uint16)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */


/* {{{ proto int SDL_WriteLE32(SDL_RWops area, int value)

 extern DECLSPEC size_t SDLCALL SDL_WriteLE32(SDL_RWops * dst, Uint32 value);
 */
PHP_FUNCTION(SDL_WriteLE32)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteLE32(rwops, (Uint32)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */


/* {{{ proto int SDL_WriteBE32(SDL_RWops area, int value)

 extern DECLSPEC size_t SDLCALL SDL_WriteBE32(SDL_RWops * dst, Uint32 value);
 */
PHP_FUNCTION(SDL_WriteBE32)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteBE32(rwops, (Uint32)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */


#if SIZEOF_LONG > 4
/* {{{ proto int SDL_WriteLE64(SDL_RWops area, int value)

 extern DECLSPEC size_t SDLCALL SDL_WriteLE64(SDL_RWops * dst, Uint64 value);
 */
PHP_FUNCTION(SDL_WriteLE64)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteLE64(rwops, (Uint64)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */


/* {{{ proto int SDL_WriteBE64(SDL_RWops area, int value)

 extern DECLSPEC size_t SDLCALL SDL_WriteBE64(SDL_RWops * dst, Uint64 value);
 */
PHP_FUNCTION(SDL_WriteBE64)
{
	zend_long value;
	zval *z_rwops;
	SDL_RWops *rwops;

	if (zend_parse_method_parameters(ZEND_NUM_ARGS(), getThis(), "Ol", &z_rwops, php_sdl_rwops_ce, &value) == FAILURE) {
		return;
	}
	FETCH_RWOPS(rwops, z_rwops, 1);

	size_t result = SDL_WriteBE64(rwops, (Uint64)value);
	if (!EG(exception)) { php_sdl_rwops_flush(z_rwops); }
	if (EG(exception)) { RETURN_THROWS(); }
	RETURN_LONG(result);
}
/* }}} */
#endif


/* generic arginfo */
ZEND_BEGIN_ARG_INFO_EX(arginfo_rwops_none, 0, 0, 0)
ZEND_END_ARG_INFO()


/* {{{ sdl_rwops_methods[] */
static const zend_function_entry php_sdl_rwops_methods[] = {
	PHP_ME(SDL_RWops,        __construct,       arginfo_rwops_none,    ZEND_ACC_CTOR|ZEND_ACC_PUBLIC)
	PHP_ME(SDL_RWops,        __toString,        arginfo_sdl_to_string,    ZEND_ACC_PUBLIC)

	/* non-static methods */
	PHP_FALIAS(Free,         SDL_FreeRW,        arginfo_rwops_none)
	PHP_FALIAS(Size,         SDL_RWsize,        arginfo_rwops_none)
	PHP_FALIAS(Seek,         SDL_RWseek,        arginfo_SDL_RWops_seek)
	PHP_FALIAS(Tell,         SDL_RWtell,        arginfo_rwops_none)
	PHP_FALIAS(Read,         SDL_RWread,        arginfo_SDL_RWops_read)
	PHP_FALIAS(Write,        SDL_RWwrite,       arginfo_SDL_RWops_write)
	PHP_FALIAS(Close,        SDL_RWclose,       arginfo_rwops_none)
	PHP_FALIAS(ReadU8,       SDL_ReadU8,        arginfo_rwops_none)
	PHP_FALIAS(ReadLE16,     SDL_ReadLE16,      arginfo_rwops_none)
	PHP_FALIAS(ReadBE16,     SDL_ReadBE16,      arginfo_rwops_none)
	PHP_FALIAS(ReadLE32,     SDL_ReadLE32,      arginfo_rwops_none)
	PHP_FALIAS(ReadBE32,     SDL_ReadBE32,      arginfo_rwops_none)
#if SIZEOF_LONG > 4
	PHP_FALIAS(ReadLE64,     SDL_ReadLE64,      arginfo_rwops_none)
	PHP_FALIAS(ReadBE64,     SDL_ReadBE64,      arginfo_rwops_none)
#endif
	PHP_FALIAS(WriteU8,      SDL_WriteU8,       arginfo_SDL_RWops_writeint)
	PHP_FALIAS(WriteLE16,    SDL_WriteLE16,     arginfo_SDL_RWops_writeint)
	PHP_FALIAS(WriteBE16,    SDL_WriteBE16,     arginfo_SDL_RWops_writeint)
	PHP_FALIAS(WriteLE32,    SDL_WriteLE32,     arginfo_SDL_RWops_writeint)
	PHP_FALIAS(WriteBE32,    SDL_WriteBE32,     arginfo_SDL_RWops_writeint)
#if SIZEOF_LONG > 4
	PHP_FALIAS(WriteLE64,    SDL_WriteLE64,     arginfo_SDL_RWops_writeint)
	PHP_FALIAS(WriteBE64,    SDL_WriteBE64,     arginfo_SDL_RWops_writeint)
#endif

	/* static methods */
	ZEND_FENTRY(FromFile,      ZEND_FN(SDL_RWFromFile),      arginfo_SDL_RWFromFile,      ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FENTRY(FromFP,        ZEND_FN(SDL_RWFromFP),        arginfo_SDL_RWFromFP,        ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FENTRY(FromMem,       ZEND_FN(SDL_RWFromMem),       arginfo_SDL_RWFromMem,       ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FENTRY(FromConstMem,  ZEND_FN(SDL_RWFromConstMem),  arginfo_SDL_RWFromConstMem,  ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)

	PHP_FE_END
};
/* }}} */

#define REGISTER_RWOPS_CLASS_CONST_LONG(const_name, value) \
	REGISTER_LONG_CONSTANT("SDL_" const_name, value, CONST_CS | CONST_PERSISTENT); \
	zend_declare_class_constant_long(php_sdl_rwops_ce, ZEND_STRL(const_name), value)


/* {{{ MINIT */
PHP_MINIT_FUNCTION(sdl_rwops)
{
	zend_class_entry ce_rwops;

	INIT_CLASS_ENTRY(ce_rwops, "SDL_RWops", php_sdl_rwops_methods);
	ce_rwops.create_object = php_sdl_rwops_new;
	php_sdl_rwops_ce = zend_register_internal_class(&ce_rwops);
	memcpy(&php_sdl_rwops_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
	php_sdl_rwops_handlers.free_obj = php_sdl_rwops_free;
	php_sdl_rwops_handlers.offset = XtOffsetOf(struct php_sdl_rwops, zo);
	php_sdl_rwops_handlers.get_gc = rwops_gc;
	php_sdl_rwops_handlers.clone_obj = NULL;
	if (php_sdl_deny_serialization(php_sdl_rwops_ce) != SUCCESS) { return FAILURE; }

	zend_declare_property_long(php_sdl_rwops_ce, ZEND_STRL("type"), 0, ZEND_ACC_PUBLIC);

	/* RWops Types */
	REGISTER_RWOPS_CLASS_CONST_LONG("UNKNOWN",        SDL_RWOPS_UNKNOWN);
	REGISTER_RWOPS_CLASS_CONST_LONG("WINFILE",        SDL_RWOPS_WINFILE);
	REGISTER_RWOPS_CLASS_CONST_LONG("STDFILE",        SDL_RWOPS_STDFILE);
	REGISTER_RWOPS_CLASS_CONST_LONG("JNIFILE",        SDL_RWOPS_JNIFILE);
	REGISTER_RWOPS_CLASS_CONST_LONG("MEMORY",         SDL_RWOPS_MEMORY);
	REGISTER_RWOPS_CLASS_CONST_LONG("MEMORY_RO",      SDL_RWOPS_MEMORY_RO);

	REGISTER_LONG_CONSTANT("RW_SEEK_SET",    RW_SEEK_SET, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("RW_SEEK_CUR",    RW_SEEK_CUR, CONST_CS | CONST_PERSISTENT);
	REGISTER_LONG_CONSTANT("RW_SEEK_END",    RW_SEEK_END, CONST_CS | CONST_PERSISTENT);

	return SUCCESS;
}
/* }}} */
