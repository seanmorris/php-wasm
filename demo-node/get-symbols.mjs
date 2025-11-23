#!/usr/bin/env node
import { PhpNode } from 'php-wasm/PhpNode.mjs';
import fs from 'node:fs';

const sharedLibs = [];
const buildType = process.env.BUILD_TYPE ?? 'dynamic';

console.log({buildType});

sharedLibs.push(
    {name: 'libcrypto.so', url: new URL('node_modules/php-wasm-openssl/libcrypto.so', import.meta.url)},
    {name: 'libssl.so',    url: new URL('node_modules/php-wasm-openssl/libssl.so',    import.meta.url)},
);

const [version, envName] = process.argv.slice(2);
const php = new PhpNode({version, envName, sharedLibs, buildType});
php.addEventListener('output', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
php.addEventListener('error', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));

php.run( fs.readFileSync('demo-node/persist/symbols.php') );
