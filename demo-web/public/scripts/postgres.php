<?php // {"autorun":true, "persist":false, "single-expression": false, "render-as": "text"}
if(!extension_loaded('pdo_pglite'))
{
    printf("The pdo_pglite extension is not loaded. pdo_pglite is required for this demo and requires PHP >=8.2.");
    exit(1);
}
$pdo = new PDO('pgsql:idb-storage');
$stm = $pdo->prepare('SELECT * FROM pg_catalog.pg_tables');

if($stm->execute())
while($row = $stm->fetch()) {
    var_dump($row);
}
