#!/usr/bin/env make

${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	- cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/${PRELOAD_NAME}.data ${PHP_DBG_DIST_DIR}
	- cp -Lprf ${PHP_DBG_DIST_DIR}/${PRELOAD_NAME}.data ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/

NOTPARALLEL+=\
	web-dbg-mjs \
	worker-dbg-mjs \
	webview-dbg-mjs \
	node-dbg-mjs \
	web-dbg-js \
	worker-dbg-js \
	webview-dbg-js \
	node-dbg-js

WEB_DBG_MJS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWeb.mjs php${PHP_SUFFIX}-dbg-web.mjs ${MJS_HELPERS_WEB})
WEB_DBG_JS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWeb.js php${PHP_SUFFIX}-dbg-web.js ${CJS_HELPERS_WEB})
WORKER_DBG_MJS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWorker.mjs php${PHP_SUFFIX}-dbg-worker.mjs ${MJS_HELPERS_WEB})
WORKER_DBG_JS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWorker.js php${PHP_SUFFIX}-dbg-worker.js ${CJS_HELPERS_WEB})
WEBVIEW_DBG_MJS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWebview.mjs php${PHP_SUFFIX}-dbg-webview.mjs ${MJS_HELPERS_WEB})
WEBVIEW_DBG_JS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgWebview.js php${PHP_SUFFIX}-dbg-webview.js ${CJS_HELPERS_WEB})
NODE_DBG_MJS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgNode.mjs php${PHP_SUFFIX}-dbg-node.mjs ${MJS_HELPERS_WEB})
NODE_DBG_JS=$(addprefix ${PHP_DBG_DIST_DIR}/,PhpDbgNode.js php${PHP_SUFFIX}-dbg-node.js ${CJS_HELPERS})

WEB_DBG_MJS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
WEB_DBG_JS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
WORKER_DBG_MJS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
WORKER_DBG_JS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
WEBVIEW_DBG_MJS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
WEBVIEW_DBG_JS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js
NODE_DBG_MJS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.mjs
NODE_DBG_JS_ASSETS= $(addprefix ${PHP_DBG_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_DBG_DIST_DIR}/config.js

ifneq (${PRELOAD_ASSETS},)
WEB_DBG_MJS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
WEB_DBG_JS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_DBG_MJS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_DBG_JS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_DBG_MJS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_DBG_JS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_DBG_MJS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_DBG_JS_ASSETS+= ${ENV_DIR}/${PHP_DBG_ASSET_DIR}/${PRELOAD_NAME}.data
endif

ifeq (${WITH_SOURCEMAPS},1)
WEB_DBG_MJS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs.wasm.map.MAPPED
WEB_DBG_JS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js.wasm.map.MAPPED
WORKER_DBG_MJS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs.wasm.map.MAPPED
WORKER_DBG_JS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs.wasm.map.MAPPED
WEBVIEW_DBG_MJS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs.wasm.map.MAPPED
WEBVIEW_DBG_JS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js.wasm.map.MAPPED
NODE_DBG_MJS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs.wasm.map.MAPPED
NODE_DBG_JS_ASSETS+= ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js.wasm.map.MAPPED
endif

web-dbg-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEB_DBG_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEB_DBG_MJS_ASSETS}
	@ cat ico.ans >&2

web-dbg-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEB_DBG_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEB_DBG_JS_ASSETS}
	@ cat ico.ans >&2

worker-dbg-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WORKER_DBG_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WORKER_DBG_MJS_ASSETS}
	@ cat ico.ans >&2

worker-dbg-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WORKER_DBG_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WORKER_DBG_JS_ASSETS}
	@ cat ico.ans >&2

webview-dbg-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEBVIEW_DBG_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEBVIEW_DBG_MJS_ASSETS}
	@ cat ico.ans >&2

webview-dbg-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEBVIEW_DBG_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEBVIEW_DBG_JS_ASSETS}
	@ cat ico.ans >&2

node-dbg-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${NODE_DBG_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${NODE_DBG_MJS_ASSETS}
	@ cat ico.ans >&2

node-dbg-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${NODE_DBG_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${NODE_DBG_JS_ASSETS}
	@ cat ico.ans >&2

dbg: dbg-all

dbg-all:
	$(MAKE) web-dbg-mjs
	$(MAKE) web-dbg-js
#	$(MAKE) worker-dbg-mjs
#	$(MAKE) worker-dbg-js
#	$(MAKE) webview-dbg-mjs
#	$(MAKE) webview-dbg-js
#	$(MAKE) node-dbg-mjs
#	$(MAKE) node-dbg-js

dbg-mjs: ${DBG_MJS}
	$(MAKE) web-dbg-mjs
#	$(MAKE) worker-dbg-mjs
#	$(MAKE) webview-dbg-mjs
#	$(MAKE) node-dbg-mjs

dbg-cjs: ${DBG_CJS}
	$(MAKE) web-dbg-js
#	$(MAKE) worker-dbg-js
#	$(MAKE) webview-dbg-js
#	$(MAKE) node-dbg-js

ifneq (${PRE_JS_FILES},)
DBG_DEPENDENCIES+= .cache/pre.js
endif

DBG_DEPENDENCIES+= third_party/php${PHP_SUFFIX}-src/configured

${PHP_DBG_DIST_DIR}/config.mjs: .env
	echo '' > $@
	echo 'export const phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'export const phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_DBG_DIST_DIR}/config.js: .env
	echo 'module.exports = {};' > $@
	echo 'module.exports.phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'module.exports.phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_DBG_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|' ${PHP_DBG_DIST_DIR}/$(notdir $@)

${PHP_DBG_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -w -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js: ENVIRONMENT=web
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-web.js.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs: ENVIRONMENT=web
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE} ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-web.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-web.mjs.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.js: ENVIRONMENT=worker
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.js.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-worker.js.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs: ENVIRONMENT=worker
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-worker.mjs.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js: ENVIRONMENT=node
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-node.js.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs: ENVIRONMENT=node
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-node.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-node.mjs.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js: BUILD_TYPE=js
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js: ENVIRONMENT=webview
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-webview.js.wasm.map ${PHP_DBG_DIST_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs: BUILD_TYPE=mjs
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs: ENVIRONMENT=webview
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs: ${DBG_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php${PHP_SUFFIX}-dbg for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make phpdbg install-phpdbg install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=phpdbg WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_SUFFIX}-src/sapi/phpdbg/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_DBG_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-worker.mjs
	- cp -Lprf ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_DBG_ASSET_DIR}

${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs.wasm.map.MAPPED: ${PHP_DBG_DIST_DIR}/php${PHP_SUFFIX}-dbg-webview.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php${PHP_VERSION}-src/sapi/dbg/php${PHP_SUFFIX}-dbg-webview.mjs.wasm.map ${PHP_DBG_DIST_DIR}
