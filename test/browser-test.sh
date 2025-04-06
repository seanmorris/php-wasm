#!/usr/bin/env bash

set -x;
PORT=9000
RUNNING=`lsof -ti:${PORT}`;

if [ ! -z "${RUNNING}" ]; then {
	echo "A process is currently using port ${PORT}" >&2
	read -p "Kill the process? (y/N) " -n 1 -r >&2
	echo

	if [[ ! $REPLY =~ ^[Yy]$ ]]; then {
		exit 0
	}
	fi

	kill ${RUNNING}
}
fi

pushd demo-web && {
	npx webpack --config service-worker-dev.config.ts && PORT=${PORT} BROWSER=none npx react-scripts start &
	trap "lsof -t -i:${PORT} | xargs -I{} kill {}" 0;
	ps aux | grep ${SERVER_PID}
};

popd;

set +x;
while ! nc -z localhost ${PORT}; do
	sleep 0.1
done
set -x;

npx cvtest test/BrowserTest.mjs
