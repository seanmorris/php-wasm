#!/usr/bin/env node
import { PhpNode } from 'php-wasm/PhpNode.mjs';
import fs from 'node:fs';
const [version, envName] = process.argv.slice(2);
const php = new PhpNode({version, envName});
php.addEventListener('output', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
php.run(fs.readFileSync('demo-node/persist/symbols.php'));
