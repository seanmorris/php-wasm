#!/usr/bin/env make

DOCKER_RUN_IN_EXT_WAITLINE=${DOCKER_ENV} -w /src/third_party/php${PHP_VERSION}-waitline/ emscripten-builder

ifdef WAITLINE_DEV_PATH
third_party/waitline/waitline.c: $(wildcard ${WAITLINE_DEV_PATH}/*.c) $(wildcard ${WAITLINE_DEV_PATH}/*.h)
	echo -e "\e[33;4mImporting WAITLINE\e[0m"
	- ${DOCKER_RUN} chown -R $(or ${UID},1000):$(or ${GID},1000) ./third_party/waitline/
	cp -prfv ${WAITLINE_DEV_PATH} third_party/
	touch third_party/waitline/waitline.c

else
third_party/waitline/waitline.c:
	@ echo -e "\e[33;4mDownloading and importing WAITLINE\e[0m"
	${DOCKER_RUN} git clone https://github.com/seanmorris/waitline.git third_party/waitline \
		--branch ${WAITLINE_BRANCH} \
		--single-branch             \
		--depth 1
endif

third_party/php${PHP_VERSION}-src/ext/waitline/waitline.c: third_party/waitline/waitline.c third_party/php${PHP_VERSION}-src/.gitignore
	@ ${DOCKER_RUN} cp -prf third_party/waitline third_party/php${PHP_VERSION}-src/ext/

third_party/php${PHP_VERSION}-src/ext/waitline/config.m4: third_party/waitline/waitline.c third_party/php${PHP_VERSION}-src/.gitignore
	@ ${DOCKER_RUN} cp -prf third_party/waitline third_party/php${PHP_VERSION}-src/ext/
#	@ ${DOCKER_RUN} touch third_party/php${PHP_VERSION}-src/ext/waitline/config.m4
