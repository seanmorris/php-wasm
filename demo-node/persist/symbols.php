import { Php<?=vrzno_env('envName')?> } from '../Php<?=vrzno_env('envName')?>.mjs';
const sharedLibs = [
<?php if(vrzno_env('buildType') === 'shared'): ?>
	await import('php-wasm-libxml')
<?php elseif(vrzno_env('buildType') === 'static'): ?>
	{name: 'libcrypto.so', url: new URL('php-wasm-openssl/libcrypto.so', import.meta.url)},
	{name: 'libssl.so',    url: new URL('php-wasm-openssl/libssl.so',    import.meta.url)},
<?php endif; ?>
];
const php = new Php<?=vrzno_env('envName')?>({version: '<?=vrzno_env('version')?>', sharedLibs, ini: `error_reporting = E_ALL ^ E_DEPRECATED`});
php.addEventListener('output', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
php.addEventListener('error', event => console.error(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
<?php foreach(get_defined_constants() as $const => $val):
	?>export const <?=str_replace('\\', '__', $const);?> = await php.x`<?=str_replace('\\', '\\\\', $const)?>`;
<?php endforeach; foreach(get_defined_functions()['internal'] as $func):?>
export const <?=str_replace('\\', '__', $func);?> = await php.x`<?=str_replace('\\', '\\\\', $func)?>(...)`;
<?php endforeach; ?>
