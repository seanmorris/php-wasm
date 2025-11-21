#!/usr/bin/env bash

set -euo pipefail;

FLAGS='-FCL 1'

cd packages/;

find . -type d | while read DIR; do {
    test -d ${DIR} || continue;
    pushd ${DIR} > /dev/null;
    tree -H "" -I "index.html" ${FLAGS} -T 'php-wasm/'${DIR:2}/ > index.html;
    perl -pi -e 's#<a class="DIR" href="./">.</a><br>#<a class="DIR" href="../">..</a><br><a class="DIR" href="./">.</a><br>#' index.html
    perl -pi -e "s#^</p>#at $(date)</p>#" index.html
    popd > /dev/null;
}; done;

ls -d | while read DIR; do {
    tar -czvf ${DIR}.tar.gz ${DIR}
}; done;

tree -H "" -I "index.html" ${FLAGS} -T 'php-wasm/' > index.html;
