/**
 * Minimal stdlib smoke test page for the browser PHP runtime.
 */
import {
	var_dump
	, file_put_contents
	, fopen
	, fread
	, feof
} from 'php-wasm/stdlib/8.5-web.mjs';


/**
 * Exercises a few filesystem helpers and logs the resulting reads.
 */
export default function FuncTest()
{
	file_put_contents('/tmp/file', 'this is the content.');

	const file = fopen('/tmp/file', 'r');

	var_dump(file);

	while(!feof(file))
	{
		console.log( fread(file, 4) );
	}
	return <div>done</div>;
}
