#include "sapi/embed/php_embed.h"
#include "sapi/phpdbg/phpdbg.h"
#include "ext/session/php_session.h"
#include "main/php_output.h"
#include "SAPI.h"
#include <emscripten.h>
#include <stdlib.h>

#include "zend_globals_macros.h"
#include "zend_exceptions.h"
#include "zend_closures.h"

#include "../json/php_json.h"
#include "../json/php_json_encoder.h"
#include "../json/php_json_parser.h"

#include <stdbool.h>

#ifdef WITH_VRZNO
#include "../vrzno/php_vrzno.h"
#endif

#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include "php.h"
#include "pib.h"
#include "php_ini.h"
#include "ext/standard/info.h"

#define STRINGIFY_INTERNAL(MACRO) #MACRO
#define STRINGIFY(MACRO)  STRINGIFY_INTERNAL(MACRO)

int main(void) { return 0; }

bool started = false;
char *_sapi_name = NULL;

/**
 * Initialize Embdedded PHP
 */
int EMSCRIPTEN_KEEPALIVE __attribute__((noinline)) pib_init(char *__sapi_name)
{
	if(!_sapi_name)
	{
		_sapi_name = malloc(strlen(__sapi_name) + 1);
		strcpy(_sapi_name, __sapi_name);
	}

	putenv("USE_ZEND_ALLOC=0");

	if(0 == strcmp(_sapi_name, "embed"))
	{
		return php_embed_init(0, NULL);
	}

	return 0;
}

/**
 * Initialize Storage Engine(s)
 */
void *EMSCRIPTEN_KEEPALIVE __attribute__((noinline)) pib_storage_init(void)
{
	if(!started)
	{
		started = true;
		bool useNodeRawFS = false;
#ifdef NODERAWFS
		useNodeRawFS = true;
#endif
		EM_ASM({
			if(Module.persist)
			{
				const persist = Array.isArray(Module.persist)
					? Module.persist
					: [Module.persist];

				const useNodeRawFS = $0;

				persist.forEach(p => {
					const mountPath = p.mountPath || '/persist';
					const localPath = p.localPath || './persist';

					FS.mkdir(mountPath);

					if(ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)
					{
						FS.mount(IDBFS, { autoPersist: false }, mountPath);
					}
					else if(ENVIRONMENT_IS_NODE)
					{
						if(!useNodeRawFS)
						{
							const fs = (globalThis.__non_webpack_require__||require)('fs');
							if(!fs.existsSync(localPath))
							{
								fs.mkdirSync(localPath, {recursive: true});
							}
							FS.mount(NODEFS, { root: localPath }, mountPath);
						}
					}
				})

			}
		}, useNodeRawFS);
	}

	return NULL;
}

/**
 * Clear PHP's memory
 */
void pib_destroy(void)
{
	if(0 == strcmp(_sapi_name, "embed"))
	{
		php_embed_shutdown();
	}
}

/**
 * Clear & refresh PHP's memory
 */
int EMSCRIPTEN_KEEPALIVE pib_refresh(void)
{
	pib_destroy();
	return pib_init(_sapi_name);
}

/**
 * Flush the buffers
 */
void EMSCRIPTEN_KEEPALIVE pib_flush(void)
{
	php_output_flush_all();
}

/**
 * Execute a single PHP statement & return the result.
 * Statement must NOT end in a semicolon.
 * Statement must NOT start with a PHP tag.
 * Multiple statements can be wrapped in an IFFE.
 * Async.
 */
char *EMSCRIPTEN_KEEPALIVE pib_exec(char *code)
{
	char *retVal = NULL;

	zend_try
	{
		zval retZv;
		zend_eval_string(code, &retZv, "php-wasm exec expression");
		convert_to_string(&retZv);
		retVal = Z_STRVAL(retZv);
	}
	zend_catch
	{
	}
	zend_end_try();

	pib_flush();

	return retVal;
}

/**
 * Run some PHP code and return the exit code.
 * 0 = good, >0 = bad.
 * Code MUST start with a PHP tag.
 * Async.
*/
int EMSCRIPTEN_KEEPALIVE pib_run(char *code)
{
	int retVal = 255; // Unknown error.

	zend_try
	{
		SG(headers_sent) = 0;
		SG(request_info).no_headers = 0;
		PS(session_status) = php_session_none;

		retVal = zend_eval_string(code, NULL, "php-wasm run script");

		if (!SG(headers_sent)) {
			sapi_send_headers();
			SG(headers_sent) = 1;
		}

		if(EG(exception) && !(zend_is_graceful_exit(EG(exception)) || zend_is_unwind_exit(EG(exception))))
		{
			zend_exception_error(EG(exception), E_ERROR);
			retVal = 2;
		}
	}
	zend_catch
	{
		retVal = 1; // Code died.
	}
	zend_end_try();

	pib_flush();

	return retVal;
}

/**
 * Return the PHP version.
*/
char* EMSCRIPTEN_KEEPALIVE pib_php_version(void)
{
	return PHP_VERSION;
}

/**
 * Return the PHP extension API version.
*/
char* EMSCRIPTEN_KEEPALIVE pib_php_ext_api_version(void)
{
	return STRINGIFY(PHP_API_VERSION);
}

bool tokenize(zval *return_value, zend_string *source, zend_class_entry *token_class);


/**
 * Return the PHP extension API version.
*/
char* EMSCRIPTEN_KEEPALIVE pib_tokenize(char *code)
{
	zval parsed;
	zend_string *zCode = zend_string_init(code, strlen(code), 0);
	tokenize(&parsed, zCode, NULL);
	zend_string_release(zCode);

	php_json_encoder encoder;
	php_json_encode_init(&encoder);
	smart_str buf = {0};
	encoder.max_depth = PHP_JSON_PARSER_DEFAULT_DEPTH;
	php_json_encode_zval(&buf, &parsed, 0, &encoder);
	smart_str_0(&buf);

	zend_long len = ZSTR_LEN(buf.s);
	char *json = ZSTR_VAL(buf.s);
	char *ret = emalloc(len);
	memcpy(ret, json, len);
	smart_str_free(&buf);

	return ret;
}

/* pib extension for PHP */

/* For compatibility with older PHP versions */
#ifndef ZEND_PARSE_PARAMETERS_NONE
#define ZEND_PARSE_PARAMETERS_NONE() \
	ZEND_PARSE_PARAMETERS_START(0, 0) \
	ZEND_PARSE_PARAMETERS_END()
#endif

PHP_RINIT_FUNCTION(pib)
{
	return SUCCESS;
}

PHP_MINIT_FUNCTION(pib)
{
#if defined(ZTS) && defined(COMPILE_DL_PIB)
	ZEND_TSRMLS_CACHE_UPDATE();
#endif
	return SUCCESS;
}

PHP_MINFO_FUNCTION(pib)
{
	php_info_print_table_start();
	php_info_print_table_row(2, "pib support", "enabled");
	php_info_print_table_end();
}

zend_module_entry pib_module_entry = {
	STANDARD_MODULE_HEADER,
	"pib",
	NULL,                    /* zend_function_entry */
	PHP_MINIT(pib),          /* PHP_MINIT - Module initialization */
	NULL,                    /* PHP_MSHUTDOWN - Module shutdown */
	PHP_RINIT(pib),          /* PHP_RINIT - Request initialization */
	NULL,                    /* PHP_RSHUTDOWN - Request shutdown */
	PHP_MINFO(pib),          /* PHP_MINFO - Module info */
	PHP_PIB_VERSION,         /* Version */
	STANDARD_MODULE_PROPERTIES
};

#ifdef COMPILE_DL_PIB
# ifdef ZTS
ZEND_TSRMLS_CACHE_DEFINE()
# endif
ZEND_GET_MODULE(pib)
#endif
