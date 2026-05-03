<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text", "extensionFlags": 1024}

$db = new SQLite3('people.db');
$db->query('CREATE TABLE IF NOT EXISTS people (
	id INTEGER PRIMARY KEY,
   	name TEXT NOT NULL
);');

for($i = 0; $i < 100; $i++) {

	$weirdName = str_repeat(chr($i+64), 10);
	$insert    = $db->prepare('INSERT INTO people (name) VALUES(:name)');

	$insert->bindValue(':name', $weirdName, SQLITE3_TEXT);

	$insert->execute();
}

$results = $db->query('SELECT * FROM people');

$rows = [];

while ($row = $results->fetchArray()) {
    var_dump($row);
}
