<?php
require '/guzzle-vendor/autoload.php';
$client = new GuzzleHttp\Client(['base_uri' => $base, 'proxy' => '', 'timeout' => 10]);
$response = $client->post('/php-wasm/curl/echo', ['body' => "binary\x00\xff", 'headers' => ['X-Custom' => ['one', 'two']]]);
$echo = json_decode((string) $response->getBody(), true);
$binary = $echo['sha256'] === hash('sha256', "binary\x00\xff") && $echo['headers']['x-custom'] === 'one, two';
$digest = (string) $client->get('/php-wasm/curl/digest', ['auth' => ['user', 'secret', 'digest']])->getBody() === 'authenticated';
$progress = [];
$client->get('/php-wasm/curl/stream', [
    'sink' => '/tmp/guzzle-download',
    'progress' => function ($total, $now) use (&$progress) { $progress[] = $now; },
]);
$streamed = strlen(file_get_contents('/tmp/guzzle-download')) === 65536 && count(array_unique($progress)) > 2;
$requests = function () use ($client) {
    foreach ([300, 0, 0, 0] as $delay) yield function () use ($client, $delay) {
        return $client->getAsync('/php-wasm/curl/echo?delay=' . $delay);
    };
};
$order = [];
$pool = new GuzzleHttp\Pool($client, $requests(), ['concurrency' => 2, 'fulfilled' => function ($response, $index) use (&$order) { $order[] = $index; }]);
$pool->promise()->wait();
echo json_encode([$binary, $digest, $streamed, $order]);
