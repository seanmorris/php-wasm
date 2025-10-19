#/usr/bin/env bash

set -eux;

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

rm -rf public/static/media/*.map public/static/media/mapped

npx webpack --config service-worker-prod.config.ts;
npx react-scripts build;

cat aphex.txt >> build/index.html;

cp build/index.html build/404.html;
cp build/index.html build/code-editor.html;
cp build/index.html build/dbg-preview.html;
cp build/index.html build/cli-preview.html;
cp build/index.html build/embedded-php.html;
cp build/index.html build/home.html;
cp build/index.html build/install-demo.html;
cp build/index.html build/select-framework.html;
cp build/index.html build/vscode.html;

git add \
	../docs/*.js \
	../docs/*.html \
	../docs/*.wasm \
	../docs/*.data \
	../docs/*.so \
	../docs/*.dat \
	../docs/*.json \
	../docs/static/* \
	../demo-web/public/*.js \
	../demo-web/public/*.wasm \
	../demo-web/public/*.data \
