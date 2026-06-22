<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "html"}

$stdErr = fopen('php://stderr', 'w');

set_error_handler(function(...$args) use($stdErr, &$errors){
	fwrite($stdErr, print_r($args,1));
});

$docroot = '/persist';
$configroot = '/config';

$files = [];
$itA  = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($docroot, FilesystemIterator::SKIP_DOTS));
$itB  = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($configroot, FilesystemIterator::SKIP_DOTS));
$zip = new \ZipArchive;

if($zip->open('/persist/backup.zip', ZipArchive::CREATE) === TRUE)
{
	foreach ($itA as $name => $entry)
	{
		if(is_dir($name)) continue;

		$files[] = $name;
	}

	foreach ($itB as $name => $entry)
	{
		if(is_dir($name)) continue;

		$files[] = $name;
	}
}

$i = $percent = 0;
foreach($files as $name)
{
	if($name === '/persist/backup.zip')
	{
		continue;
		++$i;
	}
	$zip->addFile($name);
	$newPercent = (++$i / count($files));
	if($newPercent - $percent >= 0.01)
	{
		print $newPercent . PHP_EOL;
		$percent = $newPercent;
	}
}

$zip->close();

exit;


