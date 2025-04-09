#!/usr/bin/env make

third_party/pdo-pglite/README.md: third_party/pdo-pglite/pdo_pglite.c
third_party/pdo-pglite/config.m4: third_party/pdo-pglite/pdo_pglite.c

ifdef PDO_PGLITE_DEV_PATH
third_party/pdo-pglite/pdo_pglite.c: $(wildcard ${PDO_PGLITE_DEV_PATH}/*)
	echo -e "\e[33;4mImporting pdo-pglite\e[0m"
	- ${DOCKER_RUN} chown -R $(or ${UID},1000):$(or ${GID},1000) third_party/pdo-pglite
	cp -Lrfv ${PDO_PGLITE_DEV_PATH} third_party/
else
third_party/pdo-pglite/pdo_pglite.c:
	@ echo -e "\e[33;4mDownloading and importing pdo-pglite\e[0m"
	${DOCKER_RUN} git clone https://github.com/seanmorris/pdo-pglite.git third_party/pdo-pglite \
		--branch master \
		--single-branch \
		--depth 1
endif

third_party/php${PHP_VERSION}-src/ext/pdo_pglite/%: third_party/pdo-pglite/% third_party/php${PHP_VERSION}-src/patched
	@ echo -e "\e[33;4mimporting pdo_pglite\e[0m"
	${DOCKER_RUN} cp -TLrfv third_party/pdo-pglite/ third_party/php${PHP_VERSION}-src/ext/pdo_pglite
