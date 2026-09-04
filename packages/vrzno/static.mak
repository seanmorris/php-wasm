#!/usr/bin/env make

DOCKER_RUN_IN_EXT_VRZNO=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-vrzno/ emscripten-builder

ifdef VRZNO_DEV_PATH
VRZNO_DEV_SOURCES=$(wildcard ${VRZNO_DEV_PATH}/*.c) $(wildcard ${VRZNO_DEV_PATH}/*.h) $(wildcard ${VRZNO_DEV_PATH}/*.stub.php) $(wildcard ${VRZNO_DEV_PATH}/config.m4)

third_party/vrzno/vrzno.c: ${VRZNO_DEV_SOURCES}
	echo -e "\e[33;4mImporting VRZNO\e[0m"
	- ${DOCKER_RUN} chown -R $(or ${UID},1000):$(or ${GID},1000) ./third_party/vrzno/
	cp -TLrfv ${VRZNO_DEV_PATH} third_party/vrzno
	touch third_party/vrzno/vrzno.c

else
VRZNO_REF_STAMP=third_party/vrzno/.php-wasm-ref-${VRZNO_REF}

third_party/vrzno/vrzno.c: ${VRZNO_REF_STAMP}
	@ touch $@

${VRZNO_REF_STAMP}:
	@ echo -e "\e[33;4mDownloading and importing VRZNO\e[0m"
	${DOCKER_RUN} mkdir -p third_party/vrzno
	${DOCKER_RUN} git -C third_party/vrzno init
	- ${DOCKER_RUN} git -C third_party/vrzno remote remove origin
	${DOCKER_RUN} git -C third_party/vrzno remote add origin ${VRZNO_REPOSITORY}
	${DOCKER_RUN} git -C third_party/vrzno fetch --depth 1 origin ${VRZNO_REF}
	${DOCKER_RUN} git -C third_party/vrzno checkout --detach --force FETCH_HEAD
	@ touch $@
endif

VRZNO_EXTENSION_STAMP=third_party/php${PHP_VERSION}-src/ext/vrzno/.php-wasm-source

${VRZNO_EXTENSION_STAMP}: third_party/vrzno/vrzno.c third_party/php${PHP_VERSION}-src/.gitignore
	@ ${DOCKER_RUN} cp -TLrf third_party/vrzno third_party/php${PHP_VERSION}-src/ext/vrzno
	@ touch $@

third_party/php${PHP_VERSION}-src/ext/vrzno/vrzno.c: ${VRZNO_EXTENSION_STAMP}
	@ touch $@

third_party/php${PHP_VERSION}-src/ext/vrzno/config.m4: ${VRZNO_EXTENSION_STAMP}
	@ touch $@
