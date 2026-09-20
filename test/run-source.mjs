import test from 'node:test';
import {PhpNode} from './lib/PhpNode.mjs';
import {testRunSources} from './lib/run-source-cases.mjs';

testRunSources(PhpNode, test);
