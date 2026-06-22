<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "html"}

$stdErr = fopen('php://stderr', 'w');

set_error_handler(function(...$args) use($stdErr, &$errors){
	fwrite($stdErr, print_r($args,1));
});

$pathFile = '/config/restore-path.tmp';
$docroot = file_get_contents($pathFile);

// rmdir($docroot);

if(!file_exists($docroot))
{
	mkdir($docroot, 0777, true);
}

$zip = new ZipArchive;

if($zip->open('/persist/restore.zip', ZipArchive::RDONLY) === TRUE)
{
	$total = $zip->count();
	$percent = 0;
	for($i = 0; $i < $total; $i++)
	{
		$zip->extractTo($docroot, $zip->getNameIndex($i));
		$newPercent = ((1+$i) / $total);

		if($newPercent - $percent >= 0.01)
		{
			print $newPercent . PHP_EOL;
			$percent = $newPercent;
		}
	}

	unlink($pathFile);
	unlink('/persist/restore.zip');
}


exit;


