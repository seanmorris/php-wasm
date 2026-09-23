#!/usr/bin/env node
import {mergeSdl} from './package-sdl.mjs';

const [destination, ...sources] = process.argv.slice(2);
if(!destination || !sources.length) throw new Error('Usage: merge-sdl.mjs <destination-package-dir> <source-package-dir>...');
await mergeSdl(destination, sources);
