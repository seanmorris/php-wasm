import {loadEmbeddedSharedLibs} from './runtime-libs.mjs';
import {resolveDependencies} from '/packages/php-wasm/resolveDependencies.mjs';

const query = new URL(location.href).searchParams;
const version = query.get('version');
const {libs, files} = resolveDependencies(loadEmbeddedSharedLibs(query.get('libType'), query.get('variant')), {phpVersion: version});
const element = document.querySelector('script[type="text/php"]');
element.setAttribute('data-version', version);
element.setAttribute('data-variant', query.get('variant') ?? '');
element.setAttribute('data-libs', JSON.stringify(libs));
element.setAttribute('data-files', JSON.stringify(files));
