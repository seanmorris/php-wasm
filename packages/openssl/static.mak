#!/usr/bin/env make

WITH_OPENSSL?=dynamic

OPENSSL_TAG?=OpenSSL_1_1_1-stable
DOCKER_RUN_IN_OPENSSL =${DOCKER_ENV} \
	-eCC='emcc -fPIC -flto -O${OPTIMIZE} -sLINKABLE' \
	-eCXX='emcc -fPIC -flto -O${OPTIMIZE} -sLINKABLE' \
	-w /src/third_party/openssl/ \
	emscripten-builder
DOCKER_RUN_IN_EXT_OPENSSL =${DOCKER_ENV} \
	-eCC='emcc -fPIC -flto -O${OPTIMIZE}' \
	-eCXX='emcc -fPIC -O${OPTIMIZE}' \
	-w /src/third_party/php${PHP_VERSION}-openssl/ \
	emscripten-builder

ifeq ($(filter ${WITH_OPENSSL},0 1 shared dynamic),)
$(error WITH_OPENSSL MUST BE 0, 1, shared, or dynamic (cannot be static). PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_OPENSSL},1)
WITH_OPENSSL=shared
endif

ifneq ($(filter ${WITH_OPENSSL},shared dynamic),)
# TEST_LIST+= packages/openssl/test/basic.mjs $(addprefix packages/openssl/test/,$(addsuffix .php${PHP_VERSION}.generated.mjs,openssl_digest_basic openssl_decrypt_basic))
TEST_LIST+= packages/openssl/test/basic.mjs
endif

ifeq (${WITH_OPENSSL},static)
CONFIGURE_FLAGS+= --with-openssl
ARCHIVES+= lib/lib/libssl.a lib/lib/libcrypto.a
STATIC_LIB_CONFIG+="openssl",
EXTRA_MODULES+= packages/openssl/libssl.so packages/openssl/libcrypto.so packages/openssl/php${PHP_VERSION}-openssl.so
endif

ifeq (${WITH_OPENSSL},shared)
CONFIGURE_FLAGS+= --with-openssl=/src/lib
PHP_CONFIGURE_DEPS+= packages/openssl/libssl.so packages/openssl/libcrypto.so
SHARED_LIBS+= packages/openssl/libssl.so packages/openssl/libcrypto.so
SKIP_LIBS+= -lssl -lcrypto
SHARED_LIB_CONFIG+="openssl",
EXTRA_MODULES+= packages/openssl/libssl.so packages/openssl/libcrypto.so packages/openssl/php${PHP_VERSION}-openssl.so
endif

ifeq (${WITH_OPENSSL},dynamic)
DYNAMIC_LIBS+= packages/openssl/libssl.so packages/openssl/libcrypto.so
DYNAMIC_LIBS_GROUPED+= openssl-libs
SKIP_LIBS+= -lssl -lcrypto
EXTRA_MODULES+= packages/openssl/libssl.so packages/openssl/libcrypto.so packages/openssl/php${PHP_VERSION}-openssl.so
endif

openssl-libs: packages/openssl/libssl.so packages/openssl/libcrypto.so

third_party/openssl/.gitignore:
	@ echo -e "\e[33;4mDownloading OpenSSL\e[0m"
	${DOCKER_RUN} git clone https://github.com/openssl/openssl.git third_party/openssl \
		--branch ${OPENSSL_TAG} \
		--single-branch     \
		--depth 1;

lib/lib/libcrypto.a: lib/lib/libssl.a

lib/lib/libssl.a: third_party/openssl/.gitignore
	@ echo -e "\e[33;4mBuilding OpenSSL\e[0m"
	${DOCKER_RUN_IN_OPENSSL} ./config -fPIC --prefix=/src/lib/ no-shared no-asm no-engine no-dso no-dgram no-srtp no-stdio no-err no-ocsp no-psk no-stdio no-ts -DNO_FORK -static --static
	${DOCKER_RUN_IN_OPENSSL} emmake make -j${CPU_COUNT} build_generated
	${DOCKER_RUN_IN_OPENSSL} emmake make -j${CPU_COUNT} libssl.a libcrypto.a
	${DOCKER_RUN_IN_OPENSSL} emmake make install_sw

lib/lib/libssl.so: lib/lib/libssl.a
	${DOCKER_RUN_IN_OPENSSL} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

lib/lib/libcrypto.so: lib/lib/libcrypto.a
	${DOCKER_RUN_IN_OPENSSL} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

packages/openssl/libssl.so: lib/lib/libssl.so
	cp -Lp $^ $@

packages/openssl/libcrypto.so: lib/lib/libcrypto.so
	cp -Lp $^ $@

$(addsuffix /libcrypto.so,$(sort ${SHARED_ASSET_PATHS})): packages/openssl/libcrypto.so
	cp -Lp $^ $@

$(addsuffix /libssl.so,$(sort ${SHARED_ASSET_PATHS})): packages/openssl/libssl.so
	cp -Lp $^ $@

$(addsuffix /php${PHP_VERSION}-openssl.so,$(sort ${SHARED_ASSET_PATHS})): packages/openssl/php${PHP_VERSION}-openssl.so
	cp -Lp $^ $@

packages/openssl/test/%.php${PHP_VERSION}.generated.mjs: third_party/php${PHP_VERSION}-src/ext/openssl/tests/%.phpt
	node bin/translate-test.js --file $^ --phpVersion ${PHP_VERSION} --buildType static > $@

third_party/php${PHP_VERSION}-openssl/config.m4: third_party/php${PHP_VERSION}-src/patched
	${DOCKER_RUN} cp -Lprf /src/third_party/php${PHP_VERSION}-src/ext/openssl /src/third_party/php${PHP_VERSION}-openssl
	${DOCKER_RUN} touch third_party/php${PHP_VERSION}-openssl/config.m4

packages/openssl/php${PHP_VERSION}-openssl.so: ${PHPIZE} packages/openssl/libssl.so packages/openssl/libcrypto.so third_party/php${PHP_VERSION}-openssl/config.m4
	@ echo -e "\e[33;4mBuilding php-openssl\e[0m"
	${DOCKER_RUN_IN_EXT_OPENSSL} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_OPENSSL} cp config0.m4 config.m4
	${DOCKER_RUN_IN_EXT_OPENSSL} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_OPENSSL} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache;
	${DOCKER_RUN_IN_EXT_OPENSSL} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_OPENSSL} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_OPENSSL} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_OPENSSL} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/openssl.a /src/packages/openssl/libcrypto.so /src/packages/openssl/libssl.so
