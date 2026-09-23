import { PhpWeb } from 'php-wasm/PhpWeb';
import { PhpNode } from 'php-wasm/PhpNode';

const php = new PhpWeb({version: '8.4'});
const browserRun: Promise<number> = php.run('<?php echo 1;');
const nodeRun: Promise<number> = new PhpNode().run('<?php echo 1;');
// @ts-expect-error SDL requires an explicit import from its separate package.
new PhpWeb({variant: '_sdl'});
