<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text"}
if(!extension_loaded('pdo_pglite'))
{
    printf("The pdo_pglite extension is not loaded. pdo_pglite is required for this demo and requires PHP >=8.1.");
    exit(1);
}
$pdo = new PDO('pgsql:idb://pdo-pglite-browser-pg18');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('DROP TABLE IF EXISTS pdo_pglite_browser_test');
$pdo->exec('CREATE TABLE pdo_pglite_browser_test (label TEXT NOT NULL)');

$stm = $pdo->prepare('INSERT INTO pdo_pglite_browser_test (label) VALUES (:label)');
$stm->execute(['label' => 'browser']);

$label = $pdo->query('SELECT label FROM pdo_pglite_browser_test')->fetchColumn();
printf('pdo-pglite:%s:%d', $label, $stm->rowCount());
