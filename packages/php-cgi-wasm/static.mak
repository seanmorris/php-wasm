ifeq (${WITH_CGI},1)

PHP_CGI_DIST_DIR=packages/php-cgi-wasm

CGI_MJS=$(addprefix ${PHP_CGI_DIST_DIR}/,php-cgi-web.mjs php-cgi-webview.mjs php-cgi-node.mjs php-cgi-shell.mjs php-cgi-worker.mjs) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiWeb.mjs PhpCgiWebview.mjs PhpCgiNode.mjs PhpCgiShell.mjs PhpCgiWorker.mjs) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,webTransactions.mjs breakoutRequest.mjs parseResponse.mjs)

CGI_CJS=$(addprefix ${PHP_CGI_DIST_DIR}/,php-cgi-web.js php-cgi-webview.js php-cgi-node.js php-cgi-shell.js php-cgi-worker.js) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiWeb.js PhpCgiWebview.js PhpCgiNode.js PhpCgiShell.js PhpCgiWorker.js) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,webTransactions.js breakoutRequest.js parseResponse.js)

web-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWeb.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-web.mjs)
web-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWeb.js  breakoutRequest.js  parseResponse.js  php-cgi-web.js)

worker-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWorker.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-worker.mjs)
worker-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWorker.js  breakoutRequest.js  parseResponse.js  php-cgi-worker.js)

webview-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebview.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-webview.mjs)
webview-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebview.js  breakoutRequest.js  parseResponse.js  php-cgi-webview.js)

node-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiNode.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-node.mjs)
node-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiNode.js  breakoutRequest.js  parseResponse.js  php-cgi-node.js)

shell-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiShell.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-shell.mjs)
shell-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiShell.js  breakoutRequest.js  parseResponse.js  php-cgi-shell.js)

${PHP_CGI_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_CGI_DIST_DIR}/php-cgi-web.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-web.js: ENVIRONMENT=web
${PHP_CGI_DIST_DIR}/php-cgi-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-web.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: ENVIRONMENT=web
${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-worker.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: ENVIRONMENT=worker
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: PRELOAD_METHOD=--embed-file
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: ENVIRONMENT=worker
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: PRELOAD_METHOD=--embed-file
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-node.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-node.js: ENVIRONMENT=node
${PHP_CGI_DIST_DIR}/php-cgi-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-node.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: ENVIRONMENT=node
${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-shell.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-shell.js: ENVIRONMENT=shell
${PHP_CGI_DIST_DIR}/php-cgi-shell.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-shell.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-shell.mjs: ENVIRONMENT=shell
${PHP_CGI_DIST_DIR}/php-cgi-shell.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}/
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-webview.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-webview.js: ENVIRONMENT=webview
${PHP_CGI_DIST_DIR}/php-cgi-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-webview.js: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: ENVIRONMENT=webview
${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
packages/php-cgi-webview.mjs: ${DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make ${BUILD_FLAGS} PHP_BINARIES=cgi
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp third_party/php8.2-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/

endif