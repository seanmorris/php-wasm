import { Php<?=vrzno_env('envName')?> } from '../Php<?=vrzno_env('envName')?>.mjs';
const php = new Php<?=vrzno_env('envName')?>({version: '<?=vrzno_env('version')?>', ini: `error_reporting = E_ALL ^ E_DEPRECATED`});
php.addEventListener('output', event => console.log(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
php.addEventListener('error', event => console.error(event.detail.map(line => line.replace(/\s+$/, '')).join('')));
<?php foreach(get_defined_constants() as $const => $val):
	$const = str_replace('\\', '__', $const);
	?>export const <?=$const?> = await php.x`<?=$const?>`;
<?php endforeach; foreach(get_defined_functions()['internal'] as $func):
	$func = str_replace('\\', '__', $func);?>
export const <?=$func?> = await php.x`<?=$func?>(...)`;
<?php endforeach; ?>
