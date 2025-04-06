#!/usr/bin/env make

DOCKER_RUN_IN_EXT_VRZNO=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-vrzno/ emscripten-builder

ifdef VRZNO_DEV_PATH
third_party/vrzno/vrzno.c: $(wildcard ${VRZNO_DEV_PATH}/*.c) $(wildcard ${VRZNO_DEV_PATH}/*.h)
	echo -e "\e[33;4mImporting VRZNO\e[0m"
	- ${DOCKER_RUN} chown -R $(or ${UID},1000):$(or ${GID},1000) ./third_party/vrzno/
	cp -prfv ${VRZNO_DEV_PATH} third_party/
	touch third_party/vrzno/vrzno.c

else
third_party/vrzno/vrzno.c:
	@ echo -e "\e[33;4mDownloading and importing VRZNO\e[0m"
	${DOCKER_RUN} git clone https://github.com/seanmorris/vrzno.git third_party/vrzno \
		--branch ${VRZNO_BRANCH} \
		--single-branch          \
		--depth 1
endif

third_party/php${PHP_VERSION}-src/ext/vrzno/vrzno.c: third_party/vrzno/vrzno.c third_party/php${PHP_VERSION}-src/.gitignore
	@ ${DOCKER_RUN} cp -prf third_party/vrzno third_party/php${PHP_VERSION}-src/ext/

third_party/php${PHP_VERSION}-src/ext/vrzno/config.m4: third_party/vrzno/vrzno.c third_party/php${PHP_VERSION}-src/.gitignore
	@ ${DOCKER_RUN} cp -prf third_party/vrzno third_party/php${PHP_VERSION}-src/ext/
	@ ${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/ext/vrzno/config.m4