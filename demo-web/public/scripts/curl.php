<?php // {"autorun":true, "persist":false, "single-expression":false, "render-as":"text", "extensionFlags":0, "extensions":["curl"]}

if(!extension_loaded('curl')) {
    echo "The curl extension is not loaded.\n";
    exit(1);
}

// The playground fills in this same-origin URL when it runs the example.
$url = '__PHP_WASM_CURL_DEMO_URL__';
$curl = curl_init($url);
curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);

$body = curl_exec($curl);
if($body === false) {
    echo 'cURL error: ' . curl_error($curl) . "\n";
    exit(1);
}

printf("HTTP %d\n%s\n", curl_getinfo($curl, CURLINFO_HTTP_CODE), $body);
