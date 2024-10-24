#/usr/bin/env bash

set -eux;

if [ -d 'public/static/media/mapped' ]; then {
	rm public/static/media/*.map
	rm -rf public/static/media/mapped
}
fi

if [ -d '../packages/php-wasm/mapped' ]; then {
	cp -r ../packages/php-wasm/mapped public/static/media
	cp ../packages/php-wasm/*.map public/static/media
}
fi

if [ -d '../packages/php-cgi-wasm/mapped' ]; then {
	cp -r ../packages/php-cgi-wasm/mapped public/
	cp ../packages/php-cgi-wasm/*.map public/
}
fi

rm -f build/*.wasm;
rm -f build/*.data;
rm -f build/*.map;
rm -f build/*.js;

rm -f public/*.wasm;
rm -f public/*.data;
rm -f public/*.map;
rm -f public/*.js;

npx webpack --config service-worker-dev.config.ts;
react-scripts start --no-cache
