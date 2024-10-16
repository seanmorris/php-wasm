#/usr/bin/env bash

set -eux;

rm -f build/*.wasm;
rm -f build/*.data;
rm -f build/*.map;
rm -f build/*.js;

rm -f public/*.wasm;
rm -f public/*.data;
rm -f public/*.map;
rm -f public/*.js;

npx webpack --config service-worker-prod.config.ts;
react-scripts build;

cat aphex.txt >> build/index.html;
cp build/index.html build/404.html;
cp build/index.html build/home.html;
cp build/index.html build/embedded-php.html;
cp build/index.html build/select-framework.html;
cp build/index.html build/install-demo.html;
cp build/index.html build/code-editor.html;
git add ../docs/static/js/*
