#!/usr/bin/env make

${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	- $(if $${PRELOAD_ASSETS},cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/${PRELOAD_NAME}.data ${PHP_DBG_DIST_DIR})
	- $(if $${PRELOAD_ASSETS},cp -Lprf ${PHP_DBG_DIST_DIR}/${PRELOAD_NAME}.data ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/)

NOTPARALLEL+= $(addprefix ${PHP_DBG_DIST_DIR}/,php-dbg-web.mjs php-dbg-webview.mjs php-dbg-node.mjs php-dbg-worker.mjs) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,php-dbg-web.js php-dbg-webview.js php-dbg-node.js php-dbg-worker.js)

DBG_MJS=$(addprefix ${PHP_DBG_DIST_DIR}/,php-dbg-web.mjs php-dbg-webview.mjs php-dbg-node.mjs php-dbg-worker.mjs) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWeb.mjs PhpDbgWebview.mjs PhpDbgNode.mjs PhpDbgWorker.mjs) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,webTransactions.mjs breakoutRequest.mjs parseResponse.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,resolveDependencies.mjs)

DBG_CJS=$(addprefix ${PHP_DBG_DIST_DIR}/,php-dbg-web.js php-dbg-webview.js php-dbg-node.js php-dbg-worker.js) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWeb.js PhpDbgWebview.js PhpDbgNode.js PhpDbgWorker.js) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,webTransactions.js breakoutRequest.js parseResponse.js fsOps.js msg-bus.js webTransactions.js) \
	$(addprefix ${PHP_DBG_DIST_DIR}/,resolveDependencies.js)

DBG_ALL= ${DBG_MJS} ${DBG_CJS}
ALL+= ${DBG_ALL}

ifneq (${PRE_JS_FILES},)
DBG_DEPENDENCIES+= .cache/pre.js
endif

dbg-all: ${DBG_ALL}

dbg-mjs: ${DBG_MJS}

dbg-cjs: ${DBG_CJS}

web-dbg-mjs: $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWeb.mjs breakoutRequest.mjs parseResponse.mjs php-dbg-web.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs resolveDependencies.mjs)
web-dbg-js:  $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWeb.js  breakoutRequest.js  parseResponse.js  php-dbg-web.js  fsOps.js  msg-bus.js  webTransactions.js resolveDependencies.js)

worker-dbg-mjs: $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWorker.mjs breakoutRequest.mjs parseResponse.mjs php-dbg-worker.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs resolveDependencies.mjs)
worker-dbg-js:  $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWorker.js  breakoutRequest.js  parseResponse.js  php-dbg-worker.js  fsOps.js  msg-bus.js  webTransactions.js resolveDependencies.js)

webview-dbg-mjs: $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWebview.mjs breakoutRequest.mjs parseResponse.mjs php-dbg-webview.mjs fsOps.mjs msg-bus.mjs webTransactions.mjs resolveDependencies.mjs)
webview-dbg-js:  $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWebview.js  breakoutRequest.js  parseResponse.js  php-dbg-webview.js  fsOps.js  msg-bus.js  webTransactions.js resolveDependencies.js)

node-dbg-mjs: $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgNode.mjs breakoutRequest.mjs parseResponse.mjs php-dbg-node.mjs fsOps.mjs resolveDependencies.mjs)
node-dbg-js:  $(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgNode.js  breakoutRequest.js  parseResponse.js  php-dbg-node.js  fsOps.js resolveDependencies.js)

dbg: ${DBG_MJS} ${DBG_CJS}

DBG_DEPENDENCIES+= third_party/php${PHP_VERSION}-src/configured # $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST})

${PHP_DBG_DIST_DIR}/config.mjs:
	echo '' > $@
	echo 'export const phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'export const phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_DBG_DIST_DIR}/config.js:
	echo 'module.exports = {};' > $@
	echo 'module.exports.phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'module.exports.phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_DBG_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|' ${PHP_DBG_DIST_DIR}/$(notdir $@)

${PHP_DBG_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -w -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_DBG_DIST_DIR}/php-dbg-web.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php-dbg-web.js: ENVIRONMENT=web
${PHP_DBG_DIST_DIR}/php-dbg-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-web.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-web.js.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-web.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php-dbg-web.mjs: ENVIRONMENT=web
${PHP_DBG_DIST_DIR}/php-dbg-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-web.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE} ${PHP_DBG_ASSET_DIR}/
	- cp -Lprf ${PHP_DBG_DIST_DIR}/phpdbg.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-web.mjs.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-worker.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php-dbg-worker.js: ENVIRONMENT=worker
${PHP_DBG_DIST_DIR}/php-dbg-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-worker.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-worker.js.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs: ENVIRONMENT=worker
${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-worker.mjs.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-node.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php-dbg-node.js: ENVIRONMENT=node
${PHP_DBG_DIST_DIR}/php-dbg-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-node.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-node.js.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-node.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php-dbg-node.mjs: ENVIRONMENT=node
${PHP_DBG_DIST_DIR}/php-dbg-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-node.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-node.mjs.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-webview.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php-dbg-webview.js: ENVIRONMENT=webview
${PHP_DBG_DIST_DIR}/php-dbg-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-webview.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-webview.js.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2

${PHP_DBG_DIST_DIR}/php-dbg-webview.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php-dbg-webview.mjs: ENVIRONMENT=webview
${PHP_DBG_DIST_DIR}/php-dbg-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php-dbg-webview.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -ej${CPU_COUNT} ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} /src/third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/phpdbg/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_DBG_DIST_DIR}/php-dbg-worker.mjs
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php-dbg-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}/
	${MAKE} ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
ifneq (${SKIP_SHARED_LIBS},1)
	${MAKE} $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
endif
ifeq (${WITH_SOURCEMAPS},1)
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/phpdbg/php-dbg-webview.mjs.wasm.map ${PHP_DBG_DIST_DIR}
endif
	@ cat ico.ans >&2
