#!/usr/bin/env make

WITH_SQLITE?=dynamic

SQLITE_VERSION?=3460100
SQLITE_DIR?=sqlite3.46.1-src
DOCKER_RUN_IN_SQLITE=${DOCKER_ENV} -w /src/third_party/${SQLITE_DIR}/ emscripten-builder
DOCKER_RUN_IN_EXT_SQLITE=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-sqlite/ emscripten-builder
DOCKER_RUN_IN_EXT_PDO=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-pdo/ emscripten-builder
DOCKER_RUN_IN_EXT_PDO_SQLITE=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-pdo-sqlite/ emscripten-builder

ifeq ($(filter ${WITH_SQLITE},0 1 shared static dynamic),)
$(error WITH_SQLITE MUST BE 0, 1, static, shared, OR dynamic. PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_SQLITE},1)
WITH_SQLITE=static
endif

ifeq (${WITH_SQLITE},static)
CONFIGURE_FLAGS+=  --enable-pdo --with-sqlite3 --with-pdo-sqlite
ARCHIVES+= lib/lib/libsqlite3.a
TEST_LIST+=$(shell ls packages/sqlite/test/*.mjs)
SKIP_LIBS+= -lsqlite3
PHP_ASSET_LIST+= libsqlite3.so php${PHP_VERSION}-sqlite.so php${PHP_VERSION}-pdo-sqlite.so
endif

ifeq (${WITH_SQLITE},shared)
CONFIGURE_FLAGS+=  --enable-pdo --with-sqlite3 --with-pdo-sqlite=/src/lib
PHP_CONFIGURE_DEPS+= packages/sqlite/libsqlite3.so
TEST_LIST+=$(shell ls packages/sqlite/test/*.mjs)
SHARED_LIBS+= packages/sqlite/libsqlite3.so
SKIP_LIBS+= -lsqlite3
PHP_ASSET_LIST+= libsqlite3.so php${PHP_VERSION}-sqlite.so php${PHP_VERSION}-pdo-sqlite.so
endif

ifeq (${WITH_SQLITE},dynamic)
CONFIGURE_FLAGS+=  --enable-pdo
DYNAMIC_LIBS+= packages/sqlite/libsqlite3.so
DYNAMIC_LIBS_GROUPED+= libsqlite-libs
TEST_LIST+=$(shell ls packages/sqlite/test/*.mjs)
SKIP_LIBS+= -lsqlite3
PHP_ASSET_LIST+= libsqlite3.so php${PHP_VERSION}-sqlite.so php${PHP_VERSION}-pdo-sqlite.so
endif

libsqlite-libs: packages/sqlite/libsqlite3.so

third_party/${SQLITE_DIR}/sqlite3.c:
	@ echo -e "\e[33;4mDownloading SQLite\e[0m"
	wget -q https://sqlite.org/2024/sqlite-autoconf-${SQLITE_VERSION}.tar.gz
	${DOCKER_RUN} tar -xzf sqlite-autoconf-${SQLITE_VERSION}.tar.gz
	${DOCKER_RUN} rm -r sqlite-autoconf-${SQLITE_VERSION}.tar.gz
	${DOCKER_RUN} rm -rf third_party/${SQLITE_DIR}
	${DOCKER_RUN} mv sqlite-autoconf-${SQLITE_VERSION} third_party/${SQLITE_DIR}

lib/lib/libsqlite3.a: third_party/${SQLITE_DIR}/sqlite3.c
	@ echo -e "\e[33;4mBuilding LibSqlite3\e[0m"
	${DOCKER_RUN_IN_SQLITE} emmake ./configure --with-http=no --with-ftp=no --with-python=no --with-threads=no --enable-shared=no --enable-static=yes --prefix=/src/lib/
	${DOCKER_RUN_IN_SQLITE} emmake make -j${CPU_COUNT} CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE} '
	${DOCKER_RUN_IN_SQLITE} emmake make install

lib/lib/libsqlite3.so: lib/lib/libsqlite3.a
	${DOCKER_RUN_IN_SQLITE} emcc -shared -o /src/$@ -fPIC -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/sqlite/libsqlite3.so: lib/lib/libsqlite3.so
	cp -Lp $^ $@

$(addsuffix /libsqlite3.so,$(sort ${SHARED_ASSET_PATHS})): packages/sqlite/libsqlite3.so
	cp -Lp $^ $@

third_party/php${PHP_VERSION}-sqlite/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/sqlite3 /src/third_party/php${PHP_VERSION}-sqlite
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-sqlite/config.m4

packages/sqlite/php${PHP_VERSION}-sqlite.so: ${PHPIZE} third_party/php${PHP_VERSION}-sqlite/config.m4 packages/sqlite/libsqlite3.so
	@ echo -e "\e[33;4mBuilding php-sqlite\e[0m"
	${DOCKER_RUN_IN_EXT_SQLITE} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_SQLITE} cp config0.m4 config.m4
	${DOCKER_RUN_IN_EXT_SQLITE} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_SQLITE} sed -i 's|#include "php.h"|#include "config.h"\n#include "php.h"\n|g' sqlite3.c;
	${DOCKER_RUN_IN_EXT_SQLITE} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_SQLITE} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_SQLITE} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_SQLITE} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/lib/include';
	${DOCKER_RUN_IN_EXT_SQLITE} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -DHAVE_CONFIG_H -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/sqlite3.a /src/packages/sqlite/libsqlite3.so

$(addsuffix /php${PHP_VERSION}-sqlite.so,$(sort ${SHARED_ASSET_PATHS})): packages/sqlite/php${PHP_VERSION}-sqlite.so
	cp -Lp $^ $@

# third_party/php${PHP_VERSION}-pdo/config.m4: third_party/php${PHP_VERSION}-src/patched
# 	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/pdo /src/third_party/php${PHP_VERSION}-pdo

# packages/sqlite/php${PHP_VERSION}-pdo.so: ${PHPIZE} third_party/php${PHP_VERSION}-pdo/config.m4
# 	@ echo -e "\e[33;4mBuilding php-pdo\e[0m"
# 	${DOCKER_RUN_IN_EXT_PDO} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
# 	${DOCKER_RUN_IN_EXT_PDO} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
# 	${DOCKER_RUN_IN_EXT_PDO} sed -i 's|#include "php.h"|#include "config.h"\n#include "php.h"\n|g' pdo.c;
# 	${DOCKER_RUN_IN_EXT_PDO} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
# 	${DOCKER_RUN_IN_EXT_PDO} sed -i 's#-shared#-static#g' Makefile;
# 	${DOCKER_RUN_IN_EXT_PDO} sed -i 's#-export-dynamic##g' Makefile;
# 	${DOCKER_RUN_IN_EXT_PDO} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src' RE2C=re2c;
# 	${DOCKER_RUN_IN_EXT_PDO} emmake make install
# 	${DOCKER_RUN_IN_EXT_PDO} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -DHAVE_CONFIG_H -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/pdo.a

# $(addsuffix /php${PHP_VERSION}-pdo.so,$(sort ${SHARED_ASSET_PATHS})): packages/sqlite/php${PHP_VERSION}-pdo.so
# 	cp -Lp $^ $@

third_party/php${PHP_VERSION}-pdo-sqlite/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/pdo_sqlite /src/third_party/php${PHP_VERSION}-pdo-sqlite
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-pdo-sqlite/config.m4
	${DOCKER_RUN} sed -i 's|\.\./pdo|pdo|g' third_party/php${PHP_VERSION}-pdo-sqlite/pdo_sqlite.c
	${DOCKER_RUN} sed -i 's|\.\./pdo|pdo|g' third_party/php${PHP_VERSION}-pdo-sqlite/sqlite_driver.c
	${DOCKER_RUN} sed -i 's|\.\./pdo|pdo|g' third_party/php${PHP_VERSION}-pdo-sqlite/sqlite_statement.c
	${DOCKER_RUN} sed -i 's|\.\./php_pdo|php_pdo|g' third_party/php${PHP_VERSION}-pdo-sqlite/pdo_sqlite.c
	${DOCKER_RUN} sed -i 's|\.\./php_pdo|php_pdo|g' third_party/php${PHP_VERSION}-pdo-sqlite/sqlite_driver.c
	${DOCKER_RUN} sed -i 's|\.\./php_pdo|php_pdo|g' third_party/php${PHP_VERSION}-pdo-sqlite/sqlite_statement.c

packages/sqlite/php${PHP_VERSION}-pdo-sqlite.so: ${PHPIZE} third_party/php${PHP_VERSION}-pdo-sqlite/config.m4 packages/sqlite/php${PHP_VERSION}-sqlite.so
	@ echo -e "\e[33;4mBuilding php-pdo-sqlite\e[0m"
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} sed -i 's|#include "php.h"|#include "config.h"\n#include "php.h"\n|g' pdo_sqlite.c;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache --with-pdo-sqlite=/src/lib;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src -I/src/lib/include' RE2C=re2c;
	${DOCKER_RUN_IN_EXT_PDO_SQLITE} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -DHAVE_CONFIG_H -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/pdo_sqlite.a /src/packages/sqlite/libsqlite3.so

$(addsuffix /php${PHP_VERSION}-pdo-sqlite.so,$(sort ${SHARED_ASSET_PATHS})): packages/sqlite/php${PHP_VERSION}-pdo-sqlite.so
	cp -Lp $^ $@
