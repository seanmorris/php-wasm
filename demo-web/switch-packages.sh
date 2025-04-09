#!/usr/bin/env bash

set -eux
SWITCH_TO=${1:-''}

if [[ ${SWITCH_TO} == "public" ]]; then
	SNIPPET='package.public.json'
	jq -s '.[0] * .[1]' package.json $SNIPPET > package.updated.json
	mv package.updated.json package.json
	npm install
fi

if [[ ${SWITCH_TO} == "local" ]]; then
	SNIPPET='package.local.json'
	jq -s '.[0] * .[1]' package.json $SNIPPET > package.updated.json
	mv package.updated.json package.json
	npm install
fi