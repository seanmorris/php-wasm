#!/usr/bin/env make

WITH_YAML?=dynamic

LIBYAML_TAG?=0.2.5
DOCKER_RUN_IN_LIB_YAML=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/libyaml/ emscripten-builder
DOCKER_RUN_IN_EXT_YAML=${DOCKER_ENV} -e EMCC_CFLAGS='-fPIC -flto -O${SUB_OPTIMIZE}' -w /src/third_party/php${PHP_VERSION}-yaml/ emscripten-builder

ifeq ($(filter ${WITH_YAML},0 1 shared static dynamic),)
$(error WITH_YAML MUST BE 0, 1, static, shared, OR dynamic. WITH_YAML: '${WITH_YAML}' PLEASE CHECK YOUR SETTINGS FILE: $(abspath ${ENV_FILE}))
endif

ifeq (${WITH_YAML},1)
WITH_YAML=dynamic
endif

ifeq (${WITH_YAML},static)
CONFIGURE_FLAGS+= --with-yaml=/src/lib
PHP_CONFIGURE_DEPS+= lib/lib/libyaml.a third_party/php${PHP_VERSION}-src/ext/yaml/config.m4
TEST_LIST+=$(shell ls packages/libyaml/test/*.mjs)
ARCHIVES+= lib/lib/libyaml.a
SKIP_LIBS+= -lyaml
EXTRA_MODULES+= packages/libyaml/libyaml.so packages/libyaml/php${PHP_VERSION}-yaml.so
endif

ifeq (${WITH_YAML},shared)
CONFIGURE_FLAGS+= --with-yaml=/src/lib
PHP_CONFIGURE_DEPS+= third_party/php${PHP_VERSION}-src/ext/yaml/config.m4 packages/libyaml/libyaml.so
TEST_LIST+=$(shell ls packages/libyaml/test/*.mjs)
SHARED_LIBS+= packages/libyaml/libyaml.so
SKIP_LIBS+= -lyaml
EXTRA_MODULES+= packages/libyaml/libyaml.so packages/libyaml/php${PHP_VERSION}-yaml.so
PHP_ASSET_LIST+= libyaml.so
endif

ifeq (${WITH_YAML},dynamic)
TEST_LIST+=$(shell ls packages/libyaml/test/*.mjs)
DYNAMIC_LIBS+= packages/libyaml/libyaml.so
DYNAMIC_LIBS_GROUPED+= libyaml-libs
SKIP_LIBS+= -lyaml
EXTRA_MODULES+= packages/libyaml/libyaml.so packages/libyaml/php${PHP_VERSION}-yaml.so
endif

libyaml-libs: packages/libyaml/libyaml.so

third_party/libyaml/.gitignore:
	@ echo -e "\e[33;4mDownloading libyaml\e[0m"
	${DOCKER_RUN} git clone https://github.com/yaml/libyaml.git third_party/libyaml \
		--branch ${LIBYAML_TAG} \
		--single-branch     \
		--depth 1;

lib/lib/libyaml.a: third_party/libyaml/.gitignore
	@ echo -e "\e[33;4mBuilding libyaml\e[0m"
	${DOCKER_RUN_IN_LIB_YAML} emconfigure ./bootstrap
	${DOCKER_RUN_IN_LIB_YAML} emconfigure ./configure --prefix=/src/lib/ --enable-shared=no --enable-static=yes --cache-file=/tmp/config-cache
	${DOCKER_RUN_IN_LIB_YAML} emmake make -j${CPU_COUNT}
	${DOCKER_RUN_IN_LIB_YAML} emmake make install

lib/lib/libyaml.so: lib/lib/libyaml.a
	${DOCKER_RUN_IN_LIB_YAML} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive /src/$^

third_party/php${PHP_VERSION}-yaml/config.m4:
	@ echo -e "\e[33;4mDownloading ext-yaml\e[0m"
	${DOCKER_RUN} wget -q https://pecl.php.net/get/yaml-2.2.3.tgz
	${DOCKER_RUN} tar -C third_party -xvzf yaml-2.2.3.tgz yaml-2.2.3
	${DOCKER_RUN} mv third_party/yaml-2.2.3 third_party/php${PHP_VERSION}-yaml
	${DOCKER_RUN} rm yaml-2.2.3.tgz

third_party/php${PHP_VERSION}-src/ext/yaml/config.m4: third_party/php${PHP_VERSION}-yaml/config.m4 | third_party/php${PHP_VERSION}-src/patched
	@ echo -e "\e[33;4mImporting ext-yaml\e[0m"
	${DOCKER_RUN} cp -rfv third_party/php${PHP_VERSION}-yaml third_party/php${PHP_VERSION}-src/ext/yaml

packages/libyaml/libyaml.so: lib/lib/libyaml.so
	cp $^ $@

$(addsuffix /libyaml.so,$(sort ${SHARED_ASSET_PATHS})): packages/libyaml/libyaml.so
	cp -Lp $^ $@

packages/libyaml/php${PHP_VERSION}-yaml.so: ${PHPIZE} packages/libyaml/libyaml.so third_party/php${PHP_VERSION}-yaml/config.m4
	@ echo -e "\e[33;4mBuilding php-yaml\e[0m"
	${DOCKER_RUN_IN_EXT_YAML} chmod +x /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_YAML} /src/third_party/php${PHP_VERSION}-src/scripts/phpize;
	${DOCKER_RUN_IN_EXT_YAML} emconfigure ./configure PKG_CONFIG_PATH=${PKG_CONFIG_PATH} --prefix='/src/lib/php${PHP_VERSION}' --with-php-config=/src/lib/php${PHP_VERSION}/bin/php-config --cache-file=/tmp/config-cache --with-yaml=/src/lib;
	${DOCKER_RUN_IN_EXT_YAML} sed -i 's#-shared#-static#g' Makefile;
	${DOCKER_RUN_IN_EXT_YAML} sed -i 's#-export-dynamic##g' Makefile;
	${DOCKER_RUN_IN_EXT_YAML} emmake make -j${CPU_COUNT} EXTRA_INCLUDES='-I/src/third_party/php${PHP_VERSION}-src';
	${DOCKER_RUN_IN_EXT_YAML} emcc -shared -o /src/$@ -fPIC -flto -sSIDE_MODULE=1 -O${SUB_OPTIMIZE} -Wl,--whole-archive .libs/yaml.a /src/packages/libyaml/libyaml.so

$(addsuffix /php${PHP_VERSION}-yaml.so,$(sort ${SHARED_ASSET_PATHS})): packages/libyaml/php${PHP_VERSION}-yaml.so
	cp -Lp $^ $@
