#/usr/bin/env bash

set -eux;

mkdir -p public/static/media

if [ -d 'public/static/media/mapped' ]; then {
	rm public/static/media/*.map || true
	rm -rf public/static/media/mapped
}
fi

if [ -d '../packages/php-wasm/mapped' ]; then {
	cp -r ../packages/php-wasm/mapped public/static/media
	cp ../packages/php-wasm/*.map public/static/media
}
fi

if [ -d '../packages/php-cgi-wasm/mapped' ]; then {
	cp -r ../packages/php-cgi-wasm/mapped public/static/media
	cp ../packages/php-cgi-wasm/*.map public/static/media
}
fi

if [ -d '../packages/php-cli-wasm/mapped' ]; then {
	cp -r ../packages/php-cli-wasm/mapped public/static/media
	cp ../packages/php-cli-wasm/*.map public/static/media
}
fi

if [ -d '../packages/php-dbg-wasm/mapped' ]; then {
	cp -r ../packages/php-dbg-wasm/mapped public/static/media
	cp ../packages/php-dbg-wasm/*.map public/static/media
}
fi

rm -f build/*.js;
rm -f build/*.wasm;
rm -f build/*.data;
rm -f build/*.map;
rm -f build/*.so;
rm -f build/*.dat;

rm -f public/*.js;
rm -f public/*.wasm;
rm -f public/*.data;
rm -f public/*.so;
rm -f public/*.dat;
rm -f public/*.map;

NODE_OPTIONS=--max_old_space_size=4096 npx webpack --config service-worker-dev.config.ts;

react-scripts start --no-cache
