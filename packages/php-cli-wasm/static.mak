#!/usr/bin/env make

${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/${PRELOAD_NAME}.data ${PHP_CLI_DIST_DIR}
	- cp -Lprf ${PHP_CLI_DIST_DIR}/${PRELOAD_NAME}.data ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/

NOTPARALLEL+=\
	web-cli-mjs \
	worker-cli-mjs \
	webview-cli-mjs \
	node-cli-mjs \
	web-cli-js \
	worker-cli-js \
	webview-cli-js \
	node-cli-js

WEB_CLI_MJS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliWeb.mjs php-cli-web.mjs ${MJS_HELPERS_WEB})
WEB_CLI_JS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliWeb.js php-cli-web.js ${CJS_HELPERS_WEB})
WORKER_CLI_MJS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliWorker.mjs php-cli-worker.mjs ${MJS_HELPERS_WEB})
WORKER_CLI_JS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliWorker.js php-cli-worker.js ${CJS_HELPERS_WEB})
WEBVIEW_CLI_MJS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliWebview.mjs php-cli-webview.mjs ${MJS_HELPERS_WEB})
WEBVIEW_CLI_JS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliWebview.js php-cli-webview.js ${CJS_HELPERS_WEB})
NODE_CLI_MJS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliNode.mjs php-cli-node.mjs ${MJS_HELPERS_WEB})
NODE_CLI_JS=$(addprefix ${PHP_CLI_DIST_DIR}/,PhpCliNode.js php-cli-node.js ${CJS_HELPERS})

WEB_CLI_MJS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.mjs
WEB_CLI_JS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.js
WORKER_CLI_MJS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.mjs
WORKER_CLI_JS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.js
WEBVIEW_CLI_MJS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.mjs
WEBVIEW_CLI_JS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.js
NODE_CLI_MJS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.mjs
NODE_CLI_JS_ASSETS= $(addprefix ${PHP_CLI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${PHP_CLI_DIST_DIR}/config.js

ifneq (${PRELOAD_ASSETS},)
WEB_CLI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
WEB_CLI_JS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_CLI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_CLI_JS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_CLI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_CLI_JS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_CLI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_CLI_JS_ASSETS+= ${ENV_DIR}/${PHP_CLI_ASSET_DIR}/${PRELOAD_NAME}.data
endif

ifeq (${WITH_SOURCEMAPS},1)
WEB_CLI_MJS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-web.mjs.wasm.map.MAPPED
WEB_CLI_JS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-web.js.wasm.map.MAPPED
WORKER_CLI_MJS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-worker.mjs.wasm.map.MAPPED
WORKER_CLI_JS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-worker.mjs.wasm.map.MAPPED
WEBVIEW_CLI_MJS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-webview.mjs.wasm.map.MAPPED
WEBVIEW_CLI_JS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-webview.js.wasm.map.MAPPED
NODE_CLI_MJS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-node.mjs.wasm.map.MAPPED
NODE_CLI_JS_ASSETS+= ${PHP_CLI_DIST_DIR}/php-cli-node.js.wasm.map.MAPPED
endif

web-cli-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEB_CLI_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEB_CLI_MJS_ASSETS}
	@ cat ico.ans >&2

web-cli-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEB_CLI_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEB_CLI_JS_ASSETS}
	@ cat ico.ans >&2

worker-cli-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WORKER_CLI_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WORKER_CLI_MJS_ASSETS}
	@ cat ico.ans >&2

worker-cli-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WORKER_CLI_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WORKER_CLI_JS_ASSETS}
	@ cat ico.ans >&2

webview-cli-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEBVIEW_CLI_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEBVIEW_CLI_MJS_ASSETS}
	@ cat ico.ans >&2

webview-cli-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${WEBVIEW_CLI_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${WEBVIEW_CLI_JS_ASSETS}
	@ cat ico.ans >&2

node-cli-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${NODE_CLI_MJS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${NODE_CLI_MJS_ASSETS}
	@ cat ico.ans >&2

node-cli-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) ${NODE_CLI_JS}
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${NODE_CLI_JS_ASSETS}
	@ cat ico.ans >&2

cli: cli-all

cli-all:
	$(MAKE) web-cli-mjs
	$(MAKE) web-cli-js
#	$(MAKE) worker-cli-mjs
#	$(MAKE) worker-cli-js
#	$(MAKE) webview-cli-mjs
#	$(MAKE) webview-cli-js
#	$(MAKE) node-cli-mjs
#	$(MAKE) node-cli-js

cli-mjs: ${CLI_MJS}
	$(MAKE) web-cli-mjs
#	$(MAKE) worker-cli-mjs
#	$(MAKE) webview-cli-mjs
#	$(MAKE) node-cli-mjs

cli-cjs: ${CLI_CJS}
	$(MAKE) web-cli-js
#	$(MAKE) worker-cli-js
#	$(MAKE) webview-cli-js
#	$(MAKE) node-cli-js

ifneq (${PRE_JS_FILES},)
CLI_DEPENDENCIES+= .cache/pre.js
endif

CLI_DEPENDENCIES+= third_party/php${PHP_VERSION}-src/configured

${PHP_CLI_DIST_DIR}/config.mjs: .env
	echo '' > $@
	echo 'export const phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'export const phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_CLI_DIST_DIR}/config.js: .env
	echo 'module.exports = {};' > $@
	echo 'module.exports.phpVersion = "${PHP_VERSION}";'          >> $@
	echo 'module.exports.phpVersionFull = "${PHP_VERSION_FULL}";' >> $@

${PHP_CLI_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|' ${PHP_CLI_DIST_DIR}/$(notdir $@)

${PHP_CLI_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -w -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_CLI_DIST_DIR}/php-cli-web.js: BUILD_TYPE=js
${PHP_CLI_DIST_DIR}/php-cli-web.js: ENVIRONMENT=web
${PHP_CLI_DIST_DIR}/php-cli-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-web.js: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-web.js: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-web.js: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-web.js.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-web.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-web.js.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-web.mjs: BUILD_TYPE=mjs
${PHP_CLI_DIST_DIR}/php-cli-web.mjs: ENVIRONMENT=web
${PHP_CLI_DIST_DIR}/php-cli-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-web.mjs: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-web.mjs: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-web.mjs: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_CLI_DIST_DIR}/php-cli-worker.mjs
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE} ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-web.mjs.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-web.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-web.mjs.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-worker.js: BUILD_TYPE=js
${PHP_CLI_DIST_DIR}/php-cli-worker.js: ENVIRONMENT=worker
${PHP_CLI_DIST_DIR}/php-cli-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-worker.js: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-worker.js: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-worker.js: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-worker.js.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-worker.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-worker.js.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-worker.mjs: BUILD_TYPE=mjs
${PHP_CLI_DIST_DIR}/php-cli-worker.mjs: ENVIRONMENT=worker
${PHP_CLI_DIST_DIR}/php-cli-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-worker.mjs: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-worker.mjs: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-worker.mjs: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_CLI_DIST_DIR}/php-cli-worker.mjs
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-worker.mjs.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-worker.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-worker.mjs.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-node.js: BUILD_TYPE=js
${PHP_CLI_DIST_DIR}/php-cli-node.js: ENVIRONMENT=node
${PHP_CLI_DIST_DIR}/php-cli-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-node.js: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-node.js: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-node.js: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-node.js.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-node.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-node.js.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-node.mjs: BUILD_TYPE=mjs
${PHP_CLI_DIST_DIR}/php-cli-node.mjs: ENVIRONMENT=node
${PHP_CLI_DIST_DIR}/php-cli-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-node.mjs: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-node.mjs: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-node.mjs: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-node.mjs.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-node.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-node.mjs.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-webview.js: BUILD_TYPE=js
${PHP_CLI_DIST_DIR}/php-cli-webview.js: ENVIRONMENT=webview
${PHP_CLI_DIST_DIR}/php-cli-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-webview.js: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-webview.js: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-webview.js: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-webview.js.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-webview.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-webview.js.wasm.map ${PHP_CLI_DIST_DIR}

${PHP_CLI_DIST_DIR}/php-cli-webview.mjs: BUILD_TYPE=mjs
${PHP_CLI_DIST_DIR}/php-cli-webview.mjs: ENVIRONMENT=webview
${PHP_CLI_DIST_DIR}/php-cli-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-webview.mjs: SAPI_CLI_PATH=sapi/cli/php-cli-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE}
${PHP_CLI_DIST_DIR}/php-cli-webview.mjs: PHP_CLI_OBJS=sapi/cli/php_cli.lo sapi/cli/php_http_parser.lo sapi/cli/php_cli_server.lo sapi/cli/ps_title.lo sapi/cli/php_cli_process_title.lo
${PHP_CLI_DIST_DIR}/php-cli-webview.mjs: ${CLI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding php-cli for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cli install-cli install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cli WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cli/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}* ${PHP_CLI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' ${PHP_CLI_DIST_DIR}/php-cli-worker.mjs
	- cp -Lprf ${PHP_CLI_DIST_DIR}/php-cli-${ENVIRONMENT}${RELEASE_SUFFIX}.${BUILD_TYPE}.* ${PHP_CLI_ASSET_DIR}

${PHP_CLI_DIST_DIR}/php-cli-webview.mjs.wasm.map.MAPPED: ${PHP_CLI_DIST_DIR}/php-cli-webview.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cli/php-cli-webview.mjs.wasm.map ${PHP_CLI_DIST_DIR}
