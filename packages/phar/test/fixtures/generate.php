<?php
// Regenerate with: php -d phar.readonly=0 packages/phar/test/fixtures/generate.php
foreach (['sample.phar', 'webapp.phar'] as $name) {
	if (is_file(__DIR__ . '/' . $name)) unlink(__DIR__ . '/' . $name);
}

$sample = new Phar(__DIR__ . '/sample.phar');
$sample->startBuffering();
$sample['hello.txt'] = "hello archive\n";
$sample['binary.bin'] = "\0\xffA\r\n";
$sample['nested/child.txt'] = 'nested';
$sample['main.php'] = '<?php return "included from archive";';
$sample['relative.php'] = '<?php Phar::interceptFileFuncs(); return file_get_contents("hello.txt");';
$sample->setStub('<?php Phar::mapPhar("sample.phar"); echo "stub-ok\n"; __HALT_COMPILER();');
$sample->setSignatureAlgorithm(Phar::SHA256);
$sample->stopBuffering();

$web = new Phar(__DIR__ . '/webapp.phar');
$web['index.php'] = '<?php header("Content-Type: application/json"); echo json_encode(['
	. '"path" => $_SERVER["PATH_INFO"] ?? "", "query" => $_GET]);';
$web['hello.txt'] = "web asset\n";
$web['binary.bin'] = "\0\xffA\r\n";
$web->setStub('<?php Phar::webPhar("webapp.phar", "index.php"); __HALT_COMPILER();');
$web->setSignatureAlgorithm(Phar::SHA256);
