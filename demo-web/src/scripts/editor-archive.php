<?php
/** Process a ZIP only in this worker's temporary /work filesystem. */
try {
	$request = json_decode(file_get_contents('/work/request.json'), true, 512, JSON_THROW_ON_ERROR);
	$zip = new ZipArchive;
	$entries = [];
	$total = 0;
	if ($request['mode'] === 'pack') {
		if (count($request['manifest']) > 50000) throw new RuntimeException('ZIP exceeds 50,000 entries.');
		if ($zip->open('/work/output.zip', ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Could not create ZIP.');
		foreach ($request['manifest'] as $entry) {
			if ($entry['directory']) {
				if (!$zip->addEmptyDir($entry['name'])) throw new RuntimeException('Could not add folder.');
			} else {
				$file = '/work/files/' . $entry['index'];
				$total += filesize($file);
				if ($total > 256 * 1024 * 1024) throw new RuntimeException('ZIP exceeds 256 MiB.');
				if (!$zip->addFile($file, $entry['name'])) throw new RuntimeException('Could not add file.');
			}
		}
		if (!$zip->close()) throw new RuntimeException('Could not finish ZIP.');
		// libzip removes archives without entries. Retain a standard empty ZIP instead.
		if (!file_exists('/work/output.zip')) file_put_contents('/work/output.zip', "PK\x05\x06" . str_repeat("\0", 18));
		if (filesize('/work/output.zip') > 64 * 1024 * 1024) throw new RuntimeException('Compressed ZIP exceeds 64 MiB.');
	} else {
		if (filesize('/work/input.zip') > 64 * 1024 * 1024) throw new RuntimeException('ZIP input exceeds 64 MiB.');
		if ($zip->open('/work/input.zip', ZipArchive::RDONLY) !== true) throw new RuntimeException('Invalid ZIP archive.');
		if ($zip->numFiles > 50000) throw new RuntimeException('ZIP exceeds 50,000 entries.');
		$names = [];
		// Preflight the complete inventory before decompressing any entry.
		for ($index = 0; $index < $zip->numFiles; $index++) {
			$stat = $zip->statIndex($index);
			$name = $stat['name'];
			if ($name === '' || $name[0] === '/' || strpos($name, '\\') !== false || strpos($name, "\0") !== false || preg_match('/^[a-z]:/i', $name)) throw new RuntimeException('Unsafe ZIP path.');
			$directory = substr($name, -1) === '/';
			$relative = $directory ? substr($name, 0, -1) : $name;
			foreach (explode('/', $relative) as $part) if ($part === '' || $part === '.' || $part === '..') throw new RuntimeException('Unsafe ZIP path.');
			if (isset($names[$relative])) throw new RuntimeException('Duplicate ZIP path.');
			$names[$relative] = $directory ? 'directory' : 'file';
			$opsys = $attributes = 0;
			$zip->getExternalAttributesIndex($index, $opsys, $attributes);
			$type = ($attributes >> 16) & 0170000;
			if ($opsys === 3 && $type !== 0 && $type !== 0100000 && $type !== 0040000) throw new RuntimeException('ZIP contains a symlink or special file.');
			if (isset($stat['encryption_method']) && $stat['encryption_method'] !== 0) throw new RuntimeException('Encrypted ZIP entries are unsupported.');
			$total += $stat['size'];
			if ($total > 256 * 1024 * 1024) throw new RuntimeException('Expanded ZIP exceeds 256 MiB.');
			$entries[] = ['name' => $relative, 'directory' => $directory, 'index' => $index, 'size' => $stat['size'], 'zip_name' => $name];
		}
		foreach ($names as $name => $kind) {
			$parent = dirname($name);
			while ($parent !== '.' && $parent !== '/') {
				if (($names[$parent] ?? null) === 'file') throw new RuntimeException('ZIP file/folder collision.');
				$parent = dirname($parent);
			}
		}
		$expanded = 0;
		foreach ($entries as $entry) {
			if ($entry['directory']) continue;
			$stream = $zip->getStream($entry['zip_name']);
			if ($stream === false) throw new RuntimeException('Could not read ZIP entry.');
			$output = fopen('/work/files/' . $entry['index'], 'wb');
			$length = 0;
			while (!feof($stream)) {
				$chunk = fread($stream, 1024 * 1024);
				if ($chunk === false || ($chunk === '' && !feof($stream))) throw new RuntimeException('Could not decompress ZIP entry.');
				$length += strlen($chunk);
				$expanded += strlen($chunk);
				if ($length > $entry['size'] || $expanded > 256 * 1024 * 1024) throw new RuntimeException('ZIP size limit exceeded.');
				if (fwrite($output, $chunk) !== strlen($chunk)) throw new RuntimeException('Could not write decompressed entry.');
			}
			fclose($output);
			fclose($stream);
			if ($length !== $entry['size']) throw new RuntimeException('ZIP entry size mismatch.');
		}
		$zip->close();
	}
	file_put_contents('/work/result.json', json_encode(['entries' => $entries], JSON_THROW_ON_ERROR));
} catch (Throwable $error) {
	file_put_contents('/work/result.json', json_encode(['error' => $error->getMessage()], JSON_THROW_ON_ERROR));
}
