#/usr/bin/env bash

set -eux;

export VITE_LIB_TYPE="${VITE_LIB_TYPE:-${LIB_TYPE:-${VITE_BUILD_TYPE:-${BUILD_TYPE:-}}}}"
export VITE_BUILD_TYPE="${VITE_BUILD_TYPE:-${VITE_LIB_TYPE}}"

if [ -d 'public/static/media/mapped' ]; then {
	rm public/static/media/*.map || true
	rm -rf public/static/media/mapped
}
fi

rm -f build/*.wasm;
rm -f build/*.data;
rm -f build/*.so;
rm -f build/*.dat;
rm -f build/*.map;
rm -f build/*.js;

rm -f public/*.wasm;
rm -f public/*.data;
rm -f public/*.map;
rm -f public/*.js;
rm -f public/*.so;
rm -f public/*.dat;
rm -rf public/worker-assets;
rm -f public/assets/php*-web.mjs public/assets/php*-web.mjs.wasm || true

rm -rf public/static/media/*.map public/static/media/mapped

NODE_OPTIONS='--max_old_space_size=8192' npm run build:worker;
NODE_OPTIONS='--max_old_space_size=8192' npm run build:app;

node ./scripts/generate-html-aliases.cjs;

# git add \
# 	../docs/*.js \
# 	../docs/*.html \
# 	../docs/*.wasm \
# 	../docs/*.data \
# 	../docs/*.so \
# 	../docs/*.dat \
# 	../docs/*.json \
# 	../docs/static/* \
# 	../demo-web/public/*.js \
# 	../demo-web/public/*.wasm \
# 	../demo-web/public/*.data \
