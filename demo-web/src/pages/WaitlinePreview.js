/**
 * Browser exercise for waitline's readline-compatible API.
 */
import { useState } from 'react';
import '../styles/dbg-preview.css';
import Terminal from '../components/Terminal';
import { basePath } from '../lib/runtimePaths';

const sharedLibs = [];

export const waitlineDemoCode = String.raw`
$functions = [
	'readline',
	'readline_info',
	'readline_add_history',
	'readline_clear_history',
	'readline_list_history',
	'readline_read_history',
	'readline_write_history',
	'readline_completion_function',
	'readline_callback_handler_install',
	'readline_callback_read_char',
	'readline_callback_handler_remove',
	'readline_redisplay',
	'readline_on_new_line',
];

if (!extension_loaded('waitline')) {
	fwrite(STDERR, "FAIL: the waitline extension is not loaded.\n");
	exit(1);
}

$available = array_filter($functions, 'function_exists');
printf(
	"waitline / readline browser test\nBackend: %s; API: %d/%d functions\n\n",
	READLINE_LIB,
	count($available),
	count($functions)
);
echo "Enter Unicode in step 1, then submit step 2 without typing anything.\n";

readline_clear_history();
$unicode = readline('1/3 Unicode input (try Grüße 🌍): ');
readline_add_history($unicode === false ? '' : $unicode);

$blank = readline('2/3 Blank input (press Enter): ');
readline_add_history($blank === false ? '' : $blank);

$callback = null;
readline_callback_handler_install(
	'3/3 Callback input: ',
	static function ($line) use (&$callback): void {
		$callback = $line;
		readline_callback_handler_remove();
	}
);
readline_callback_read_char();
readline_add_history($callback === null ? '' : $callback);

$historyFile = tempnam(sys_get_temp_dir(), 'waitline-demo.');
$historyWritten = readline_write_history($historyFile);
readline_clear_history();
$historyRead = readline_read_history($historyFile);
$history = readline_list_history();
unlink($historyFile);

$completionInstalled = readline_completion_function(static fn (): array => []);
$oldBuffer = readline_info('line_buffer', 'browser-demo');
$buffer = readline_info('line_buffer');
readline_on_new_line();

echo "\nResults\n";
printf("- Unicode input: %s\n", json_encode($unicode, JSON_UNESCAPED_UNICODE));
printf("- Blank input: %s\n", $blank === '' ? 'PASS' : 'FAIL');
printf("- Callback input: %s\n", json_encode($callback, JSON_UNESCAPED_UNICODE));
printf("- History round trip: %s\n", $historyWritten && $historyRead ? 'PASS' : 'FAIL');
printf("- History: %s\n", json_encode($history, JSON_UNESCAPED_UNICODE));
printf("- Completion registration: %s\n", $completionInstalled ? 'PASS' : 'FAIL');
printf("- readline_info buffer: %s -> %s\n", json_encode($oldBuffer), json_encode($buffer));

$passed = count($available) === count($functions)
	&& $unicode !== false
	&& $blank === ''
	&& $callback !== null
	&& $historyWritten
	&& $historyRead
	&& $completionInstalled;

echo $passed ? "\nPASS: waitline input and readline compatibility are working.\n"
	: "\nFAIL: one or more waitline checks failed.\n";
exit($passed ? 0 : 1);
`;

/**
 * Runs a guided waitline exercise inside the browser-hosted PHP CLI.
 */
export default function WaitlinePreview()
{
	const [exitCode, setExitCode] = useState();
	const [statusMessage, setStatusMessage] = useState('php-wasm');

	const topBar = (<div className = "row header toolbar">
		<div className = "cols">
			<div className = "row start">
				<span className = "contents">
					<a href = {basePath()}>
						<img src = "sean-icon.png" alt = "sean" />
					</a>
					<h1><a href = {basePath()}>php-wasm</a></h1>
					<hr />
				</span>
			</div>
			<div className = "separator"></div>
			<div>
				<h1>waitline / readline test</h1>
			</div>
		</div>
	</div>);

	const statusBar = (<div className = "row status">
		<div className = "row start wide toolbar" data-status>{statusMessage}</div>
		<div className = "row start toolbar" data-status>{exitCode}</div>
	</div>);

	return (<div className = "dbg-preview waitline-preview margined">
		<div className = "bevel column">
			{topBar}
			<div className = "inset frame">
				<Terminal
					setStatusMessage = {setStatusMessage}
					setExitCode = {setExitCode}
					interactive = {false}
					lineInput = {true}
					inputPrompt = ""
					code = {waitlineDemoCode}
					sharedLibs = {sharedLibs}
				/>
			</div>
			{statusBar}
		</div>
	</div>);
}
