#include "ext/sdl/src/php_sdl_extra.h"
#include "sdl_ttf_font.h"
#include "zend_exceptions.h"
#include "zend_interfaces.h"
#include "sdl_ttf_arginfo.h"

zend_class_entry *ttf_font_ce = NULL;
static HashTable live_fonts;
zend_object_handlers php_ttf_font_object_handlers;

php_ttf_font_object *php_ttf_font_object_from_zend_object(zend_object *zobj)
{
    return (php_ttf_font_object *)((char *)zobj - XtOffsetOf(php_ttf_font_object, std));
}

zend_object *php_ttf_font_object_to_zend_object(php_ttf_font_object *obj)
{
    return &obj->std;
}

TTF_Font *php_ttf_font_from_zval_p(zval *zp)
{
    TTF_Font *font = php_ttf_font_object_from_zend_object(Z_OBJ_P(zp))->internal;
    if (!font) { zend_throw_error(NULL, "TTF_Font has been closed"); }
    return font;
}

void ttf_font_to_zval(TTF_Font *ttf_font, zval *zp)
{
    if (!ttf_font) { ZVAL_NULL(zp); return; }
    object_init_ex(zp, ttf_font_ce);
    php_ttf_font_object *php_ttf_font = php_ttf_font_object_from_zend_object(Z_OBJ_P(zp));
    php_ttf_font->internal = ttf_font;
    /* Weak registry: ordinary PHP ownership must release unused fonts. */
    zend_hash_index_add_ptr(&live_fonts, (zend_ulong)(uintptr_t)ttf_font, php_ttf_font);
}

zend_object *php_ttf_font_object_create(zend_class_entry *ce)
{
    php_ttf_font_object *obj = zend_object_alloc(sizeof(php_ttf_font_object), ce);
    zend_object *zobj = php_ttf_font_object_to_zend_object(obj);

    obj->internal = NULL;
    zend_object_std_init(zobj, ce);
    object_properties_init(zobj, ce);
    zobj->handlers = &php_ttf_font_object_handlers;

    return zobj;
}

void php_ttf_font_object_free(zend_object *zobj)
{
    php_ttf_font_object *obj = php_ttf_font_object_from_zend_object(zobj);

    if (obj->internal)
    {
        TTF_Font *font = obj->internal;
        obj->internal = NULL;
        zend_hash_index_del(&live_fonts, (zend_ulong)(uintptr_t)font);
        TTF_CloseFont(font);
    }

    zend_object_std_dtor(zobj);
}

zend_function *php_ttf_font_object_get_constructor(zend_object *object)
{
    zend_throw_error(NULL, "You cannot initialize a TTF_Font object except through helper functions");
    return NULL;
}

zend_result php_ttf_font_minit_helper(void)
{
    ttf_font_ce = register_class_TTF_Font();
    ttf_font_ce->create_object = php_ttf_font_object_create;
    if (php_sdl_deny_serialization(ttf_font_ce) != SUCCESS) { return FAILURE; }

    memcpy(&php_ttf_font_object_handlers, &std_object_handlers, sizeof(zend_object_handlers));
    php_ttf_font_object_handlers.clone_obj = NULL;
    php_ttf_font_object_handlers.free_obj = php_ttf_font_object_free;
    php_ttf_font_object_handlers.get_constructor = php_ttf_font_object_get_constructor;
    php_ttf_font_object_handlers.offset = XtOffsetOf(php_ttf_font_object, std);
    return SUCCESS;
}

void php_ttf_font_release(zval *value)
{
    php_ttf_font_object *object = php_ttf_font_object_from_zend_object(Z_OBJ_P(value));
    TTF_Font *font = object->internal;
    if (!font) { return; }
    object->internal = NULL;
    TTF_CloseFont(font);
    zend_hash_index_del(&live_fonts, (zend_ulong)(uintptr_t)font);
}

void php_ttf_fonts_init(void)
{
    zend_hash_init(&live_fonts, 8, NULL, NULL, 0);
}

void php_ttf_fonts_close(void)
{
    php_ttf_font_object *object;
    ZEND_HASH_FOREACH_PTR(&live_fonts, object) {
        if (object->internal) { TTF_CloseFont(object->internal); object->internal = NULL; }
    } ZEND_HASH_FOREACH_END();
    zend_hash_clean(&live_fonts);
}

void php_ttf_fonts_shutdown(void)
{
    php_ttf_fonts_close();
    zend_hash_destroy(&live_fonts);
    while (TTF_WasInit()) { TTF_Quit(); }
}
