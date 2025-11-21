#!/usr/bin/env make

${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data: .cache/preload-collected
	- cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/${PRELOAD_NAME}.data ${PHP_CGI_DIST_DIR}
	- cp -Lprf ${PHP_CGI_DIST_DIR}/${PRELOAD_NAME}.data ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/

NOTPARALLEL+=\
	web-cgi-mjs \
	worker-cgi-mjs \
	webview-cgi-mjs \
	node-cgi-mjs \
	web-cgi-js \
	worker-cgi-js \
	webview-cgi-js \
	node-cgi-js

CGI_MJS_HELPERS=breakoutRequest.mjs parseResponse.mjs msg-bus.mjs
CGI_CJS_HELPERS=breakoutRequest.js  parseResponse.js  msg-bus.js

CGI_MJS_HELPERS_WEB=${CGI_MJS_HELPERS} msg-bus.mjs
CGI_CJS_HELPERS_WEB=${CGI_CJS_HELPERS} msg-bus.js

WEB_CGI_MJS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebBase.mjs PhpCgiWeb.mjs php${PHP_SUFFIX}-cgi-web.mjs ${CGI_MJS_HELPERS_WEB} ${MJS_HELPERS_WEB})
WEB_CGI_JS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebBase.js  PhpCgiWeb.js php${PHP_SUFFIX}-cgi-web.js ${CGI_CJS_HELPERS_WEB} ${CJS_HELPERS_WEB})
WORKER_CGI_MJS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebBase.mjs PhpCgiWorker.mjs php${PHP_SUFFIX}-cgi-worker.mjs ${CGI_MJS_HELPERS_WEB} ${MJS_HELPERS_WEB})
WORKER_CGI_JS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebBase.js  PhpCgiWorker.js php${PHP_SUFFIX}-cgi-worker.js ${CGI_CJS_HELPERS_WEB} ${CJS_HELPERS_WEB})
WEBVIEW_CGI_MJS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiWebBase.mjs PhpCgiWebview.mjs php${PHP_SUFFIX}-cgi-webview.mjs ${CGI_MJS_HELPERS_WEB} ${MJS_HELPERS_WEB})
WEBVIEW_CGI_JS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiWebBase.js  PhpCgiWebview.js php${PHP_SUFFIX}-cgi-webview.js ${CGI_CJS_HELPERS_WEB} ${CJS_HELPERS_WEB})
NODE_CGI_MJS=$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.mjs PhpCgiNode.mjs php${PHP_SUFFIX}-cgi-node.mjs ${CGI_MJS_HELPERS} ${MJS_HELPERS})
NODE_CGI_JS =$(addprefix ${PHP_CGI_DIST_DIR}/,PhpCgiBase.js  PhpCgiNode.js php${PHP_SUFFIX}-cgi-node.js ${CGI_CJS_HELPERS} ${CJS_HELPERS})

WEB_CGI_MJS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
WEB_CGI_JS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}
WORKER_CGI_MJS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
WORKER_CGI_JS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}
WEBVIEW_CGI_MJS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
WEBVIEW_CGI_JS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}
NODE_CGI_MJS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES} ${HELPER_MJS}
NODE_CGI_JS_ASSETS= $(addprefix ${PHP_CGI_ASSET_DIR}/,${PHP_ASSET_LIST}) ${EXTRA_MODULES}

ifneq (${PRELOAD_ASSETS},)
WEB_CGI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
WEB_CGI_JS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_CGI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
WORKER_CGI_JS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_CGI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
WEBVIEW_CGI_JS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_CGI_MJS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
NODE_CGI_JS_ASSETS+= ${ENV_DIR}/${PHP_CGI_ASSET_DIR}/${PRELOAD_NAME}.data
endif

ifeq (${WITH_SOURCEMAPS},1)
WEB_CGI_MJS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs.wasm.map.MAPPED
WEB_CGI_JS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js.wasm.map.MAPPED
WORKER_CGI_MJS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs.wasm.map.MAPPED
WORKER_CGI_JS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs.wasm.map.MAPPED
WEBVIEW_CGI_MJS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs.wasm.map.MAPPED
WEBVIEW_CGI_JS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js.wasm.map.MAPPED
NODE_CGI_MJS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs.wasm.map.MAPPED
NODE_CGI_JS_ASSETS+= ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js.wasm.map.MAPPED
endif

web-cgi-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(WEB_CGI_MJS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(WEB_CGI_MJS_ASSETS)
	@ cat ico.ans >&2

web-cgi-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(WEB_CGI_JS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(WEB_CGI_JS_ASSETS)
	@ cat ico.ans >&2

worker-cgi-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(WORKER_CGI_MJS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(WORKER_CGI_MJS_ASSETS)
	@ cat ico.ans >&2

worker-cgi-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(WORKER_CGI_JS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(WORKER_CGI_JS_ASSETS)
	@ cat ico.ans >&2

webview-cgi-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(WEBVIEW_CGI_MJS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(WEBVIEW_CGI_MJS_ASSETS)
	@ cat ico.ans >&2

webview-cgi-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(WEBVIEW_CGI_JS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(WEBVIEW_CGI_JS_ASSETS)
	@ cat ico.ans >&2

node-cgi-mjs:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(NODE_CGI_MJS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(NODE_CGI_MJS_ASSETS)
	@ cat ico.ans >&2

node-cgi-js:
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} ${PHP_CONFIGURE_DEPS}
	$(MAKE) $(NODE_CGI_JS)
	$(MAKE) -j${CPU_COUNT} -l${MAX_LOAD} $(NODE_CGI_JS_ASSETS)
	@ cat ico.ans >&2

cgi: cgi-all

cgi-all:
	$(MAKE) web-cgi-mjs
	$(MAKE) worker-cgi-mjs
	$(MAKE) webview-cgi-mjs
	$(MAKE) node-cgi-mjs
	$(MAKE) web-cgi-js
	$(MAKE) worker-cgi-js
	$(MAKE) webview-cgi-js
	$(MAKE) node-cgi-js

cgi-mjs:
	$(MAKE) web-cgi-mjs
	$(MAKE) worker-cgi-mjs
	$(MAKE) webview-cgi-mjs
	$(MAKE) node-cgi-mjs

cgi-cjs:
	$(MAKE) web-cgi-js
	$(MAKE) worker-cgi-js
	$(MAKE) webview-cgi-js
	$(MAKE) node-cgi-js

cgi-helpers-mjs: $(addprefix ${PHP_CGI_DIST_DIR}/,${CGI_MJS_HELPERS_WEB} ${MJS_HELPERS_WEB})

cgi-helpers-cjs: $(addprefix ${PHP_CGI_DIST_DIR}/,${CGI_CJS_HELPERS_WEB} ${CJS_HELPERS_WEB})

ifneq (${PRE_JS_FILES},)
CGI_DEPENDENCIES+= .cache/pre.js
endif

CGI_DEPENDENCIES+= third_party/php${PHP_VERSION}-src/configured

${PHP_CGI_DIST_DIR}/%.js: source/%.js
	npx babel $< --out-dir ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import.meta|(undefined /*import.meta*/)|' ${PHP_CGI_DIST_DIR}/$(notdir $@)

${PHP_CGI_DIST_DIR}/%.mjs: source/%.js
	cp $< $@;
	perl -pi -w -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js: ENVIRONMENT=web
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-web.js.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs: ENVIRONMENT=web
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|REMOTE_PACKAGE_BASE="(.+?)"|REMOTE_PACKAGE_BASE=new URL("\1", import.meta.url).href|g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-web.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-web.mjs.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.js: ENVIRONMENT=worker
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.js: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.js.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-worker.js.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs: ENVIRONMENT=worker
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs: FS_TYPE=${WORKER_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|REMOTE_PACKAGE_BASE="(.+?)"|REMOTE_PACKAGE_BASE=new URL("\1", import.meta.url).href|g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-worker.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-worker.mjs.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js: ENVIRONMENT=node
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js: FS_TYPE=${NODE_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-node.js.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs: ENVIRONMENT=node
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs: FS_TYPE=${NODE_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-node.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-node.mjs.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js: BUILD_TYPE=js
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js: ENVIRONMENT=webview
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\?\?=#\1=\1??#g' $@
	perl -pi -w -e 's#([^;{}]+)\s*\|\|=#\1=\1\|\|#g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.js
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-webview.js.wasm.map ${PHP_CGI_DIST_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs: BUILD_TYPE=mjs
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs: ENVIRONMENT=webview
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs: FS_TYPE=${WEB_FS_TYPE}
${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs: ${CGI_DEPENDENCIES} | ${ORDER_ONLY}
	@ echo -e "\e[33;4mBuilding PHP-CGI ${PHP_VERSION} for ${ENVIRONMENT} {${BUILD_TYPE}}\e[0m"
	${DOCKER_RUN_IN_PHP} emmake make cgi install-cgi install-build install-programs install-headers -e ${BUILD_FLAGS} PHP_BINARIES=cgi WASM_SHARED_LIBS="$(addprefix /src/,${SHARED_LIBS})"
	${DOCKER_RUN_IN_PHP} mv -f \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.${BUILD_TYPE} \
		/src/third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}
	cp -Lprf third_party/php${PHP_VERSION}-src/sapi/cgi/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}* ${PHP_CGI_DIST_DIR}/
	perl -pi -w -e 's|import(name)|import(/* webpackIgnore: true */ name)|g' $@
	perl -pi -w -e 's|require("fs")|require(/* webpackIgnore: true */ "fs")|g' $@
	perl -pi -w -e 's|var _script(Dir\|Name) = import.meta.url;|const importMeta = import.meta;var _script\1 = importMeta.url;|g' $@
	perl -pi -w -e 's|REMOTE_PACKAGE_BASE="(.+?)"|REMOTE_PACKAGE_BASE=new URL("\1", import.meta.url).href|g' $@
	- cp -Lprf ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-${ENVIRONMENT}.${BUILD_TYPE}.* ${PHP_CGI_ASSET_DIR}

${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs.wasm.map.MAPPED: ${PHP_CGI_DIST_DIR}/php${PHP_SUFFIX}-cgi-webview.mjs
	${DOCKER_RUN} ./remap-sourcemap.sh third_party/php8.3-src/sapi/cgi/php${PHP_SUFFIX}-cgi-webview.mjs.wasm.map ${PHP_CGI_DIST_DIR}
