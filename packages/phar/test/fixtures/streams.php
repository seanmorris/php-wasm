<?php
set_error_handler(function ($severity, $message, $file, $line) {
	throw new ErrorException($message, 0, $severity, $file, $line);
});

function expect_phar($actual, $expected) {
	if ($actual !== $expected) {
		throw new RuntimeException(var_export([$actual, $expected], true));
	}
}

$archive = 'phar://' . __DIR__ . '/sample.phar';
expect_phar(in_array('phar', stream_get_wrappers(), true), true);
expect_phar(file_get_contents($archive . '/hello.txt'), "hello archive\n");
expect_phar(bin2hex(file_get_contents($archive . '/binary.bin')), '00ff410d0a');
expect_phar([filesize($archive . '/hello.txt'), is_file($archive . '/hello.txt'), is_dir($archive . '/nested')], [14, true, true]);
expect_phar(scandir($archive . '/nested'), ['child.txt']);
$stream = fopen($archive . '/hello.txt', 'rb');
fseek($stream, 6);
expect_phar([ftell($stream), fread($stream, 7), fstat($stream)['size']], [6, 'archive', 14]);
fclose($stream);
expect_phar(include $archive . '/main.php', 'included from archive');
expect_phar(include $archive . '/relative.php', "hello archive\n");
ob_start();
include __DIR__ . '/sample.phar';
expect_phar(ob_get_clean(), "stub-ok\n");
expect_phar(file_get_contents('phar://sample.phar/hello.txt'), "hello archive\n");

expect_phar(file_put_contents($archive . '/new.txt', 'new contents'), 12);
expect_phar(file_get_contents($archive . '/new.txt'), 'new contents');
expect_phar(mkdir($archive . '/newdir'), true);
expect_phar(rename($archive . '/new.txt', $archive . '/newdir/moved.txt'), true);
expect_phar(file_get_contents($archive . '/newdir/moved.txt'), 'new contents');
expect_phar(unlink($archive . '/newdir/moved.txt'), true);
expect_phar(rmdir($archive . '/newdir'), true);

$created = new Phar(__DIR__ . '/created.phar');
$created['hello.txt'] = 'created';
expect_phar(file_get_contents('phar://' . __DIR__ . '/created.phar/hello.txt'), 'created');
$tar = new PharData(__DIR__ . '/sample.tar');
$tar['hello.txt'] = 'tar contents';
expect_phar(file_get_contents('phar://' . __DIR__ . '/sample.tar/hello.txt'), 'tar contents');

$bytes = file_get_contents(__DIR__ . '/sample.phar');
$bytes[strlen($bytes) - 9] = chr(ord($bytes[strlen($bytes) - 9]) ^ 1);
file_put_contents(__DIR__ . '/bad.phar', $bytes);
foreach ([
	[$archive . '/missing.txt', 'rb', 'not a file'],
	['phar://' . __DIR__ . '/bad.phar/hello.txt', 'rb', 'broken signature'],
	[$archive . '/hello.txt', 'ab', 'append not supported'],
] as [$path, $mode, $message]) {
	try {
		fopen($path, $mode);
		throw new RuntimeException('Expected a stream error for ' . $path);
	} catch (ErrorException $error) {
		expect_phar(str_contains($error->getMessage(), $message), true);
	}
}
echo "phar-streams-ok\n";
