<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text", "extensionFlags": 4096}

$db = new PDO('sqlite:people.db');

$db->query('CREATE TABLE IF NOT EXISTS people (
	id INTEGER PRIMARY KEY,
   	name TEXT NOT NULL
);');

for($i = 0; $i < 10; $i++) {
	$weirdName = str_repeat(chr($i+64), 10);
	$insert    = $db->prepare('INSERT INTO people (name) VALUES(:name)');

	$insert->bindParam(':name', $weirdName, SQLITE3_TEXT);

	$insert->execute();
}

$results = $db->query('SELECT * FROM people');

$rows = [];

while ($row = $results->fetchObject()) {
    print_r($row);
}
