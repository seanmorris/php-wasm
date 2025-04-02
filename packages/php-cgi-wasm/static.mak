#!/usr/bin/env make

${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	- $(if $${PRELOAD_ASSETS},cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/${PRELOAD_NAME}.data ${PHP_CGI_DIST_DIR})
	- $(if $${PRELOAD_ASSETS},cp -Lprf ${PHP_CGI_DIST_DIR}/${PRELOAD_NAME}.data ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/)

NOTPARALLEL+= $(addprefix ${PHP_CGI_DIST_DIR}/,php-cgi-web.mjs php-cgi-webview.mjs php-cgi-node.mjs php-cgi-worker.mjs) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,php-cgi-web.js php-cgi-webview.js php-cgi-node.js php-cgi-worker.js)

CGI_MJS=$(addprefix ${PHP_CGI_DIST_DIR}/,php-cgi-web.mjs php-cgi-webview.mjs php-cgi-node.mjs php-cgi-worker.mjs) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiWeb.mjs PhpCgiWebview.mjs PhpCgiNode.mjs PhpCgiWorker.mjs PhpCgiBase.mjs) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,webTransactions.mjs breakoutRequest.mjs parseResponse.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,resolveDependencies.mjs PhpCgiWebBase.mjs)

CGI_CJS=$(addprefix ${PHP_CGI_DIST_DIR}/,php-cgi-web.js php-cgi-webview.js php-cgi-node.js php-cgi-worker.js) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiWeb.js PhpCgiWebview.js PhpCgiNode.js PhpCgiWorker.js PhpCgiBase.js) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,webTransactions.js breakoutRequest.js parseResponse.js fsOps.js msg-bus.js webTransactions.js) \
	$(addprefix ${PHP_CGI_DIST_DIR}/,resolveDependencies.js PhpCgiWebBase.js)

CGI_ALL= ${CGI_MJS} ${CGI_CJS}
ALL+= ${CGI_ALL}

ifneq (${PRE_JS_FILES},)
CGI_DEPENDENCIES+= .cache/pre.js
endif

cgi-all: ${CGI_ALL}

cgi-mjs: ${CGI_MJS}

cgi-cjs: ${CGI_CJS}

web-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebBase.mjs PhpCgiWeb.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-web.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs resolveDependencies.mjs)
web-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebBase.js  PhpCgiWeb.js  breakoutRequest.js  parseResponse.js  php-cgi-web.js  fsOps.js  msg-bus.js  webTransactions.js resolveDependencies.js)

worker-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebBase.mjs PhpCgiWorker.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-worker.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs resolveDependencies.mjs)
worker-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebBase.js  PhpCgiWorker.js  breakoutRequest.js  parseResponse.js  php-cgi-worker.js  fsOps.js  msg-bus.js  webTransactions.js resolveDependencies.js)

webview-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebBase.mjs PhpCgiWebview.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-webview.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs resolveDependencies.mjs)
webview-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebBase.js  PhpCgiWebview.js  breakoutRequest.js  parseResponse.js  php-cgi-webview.js  fsOps.js  msg-bus.js  webTransactions.js resolveDependencies.js)

node-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiNode.mjs breakoutRequest.mjs parseResponse.mjs php-cgi-node.mjs fsOps.mjs resolveDependencies.mjs)
node-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiNode.js  breakoutRequest.js  parseResponse.js  php-cgi-node.js  fsOps.js resolveDependencies.js)

# Deprecated
shell-cgi-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs breakoutRequest.mjs parseResponse.mjs fsOps.mjs resolveDependencies.mjs)
shell-cgi-js:  $(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  breakoutRequest.js  parseResponse.js  fsOps.js resolveDependencies.js)

cgi: ${CGI_MJS} ${CGI_CJS}

CGI_DEPENDENCIES+= third_party/php${PHP_VERSION}-src/configured # $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST})

${PHP_CGI_DIST_DIR}/config.mjs: .env
	echo '' > $@
	echo 'export const phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'export const phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_CGI_DIST_DIR}/config.js: .env
	echo 'module.exports = {};' > $@
	echo 'module.exports.phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'module.exports.phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_CGI_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|' ${PHP_CGI_DIST_DIR}/$(notdir $@)

${PHP_CGI_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -w -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_CGI_DIST_DIR}/php-cgi-web.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-web.js: ENVIRONMENT=web
${PHP_CGI_DIST_DIR}/php-cgi-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-web.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-web.js.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: ENVIRONMENT=web
${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-web.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-web.mjs.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-worker.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: ENVIRONMENT=worker
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-worker.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-worker.js.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: ENVIRONMENT=worker
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-worker.mjs.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-node.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-node.js: ENVIRONMENT=node
${PHP_CGI_DIST_DIR}/php-cgi-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-node.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-node.js.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: ENVIRONMENT=node
${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-node.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-node.mjs.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-webview.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php-cgi-webview.js: ENVIRONMENT=webview
${PHP_CGI_DIST_DIR}/php-cgi-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-webview.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-webview.js.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: ENVIRONMENT=webview
${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php-cgi-webview.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_CGI_DIST_DIR}/php-cgi-worker.mjs
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php-cgi-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CGI_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php-cgi-webview.mjs.wasm.map ${PHP_CGI_DIST_DIR}
endif
	@ cat ico.ans >&2
