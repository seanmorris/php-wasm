<?php
$ch = curl_init("$base/stream");
$headers = false;
$writes = 0;
$length = 0;
$progress = [];
curl_setopt_array($ch, [
    CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$headers) { $headers = true; return strlen($line); },
    CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$writes, &$length, &$headers) {
        if (!$headers) throw new RuntimeException('Body arrived before headers');
        ++$writes;
        $length += strlen($chunk);
        return strlen($chunk);
    },
    CURLOPT_NOPROGRESS => false,
    CURLOPT_PROGRESSFUNCTION => function ($ch, $total, $now) use (&$progress) { $progress[] = $now; return 0; },
]);
$ok = curl_exec($ch);
$streamed = $ok && $length === 65536 && $writes > 1 && count(array_unique($progress)) > 2;
curl_setopt($ch, CURLOPT_PROGRESSFUNCTION, function ($ch, $total, $now) { return $now > 0 ? 1 : 0; });
$aborted = curl_exec($ch) === false && curl_errno($ch) === CURLE_ABORTED_BY_CALLBACK;
curl_setopt_array($ch, [CURLOPT_NOPROGRESS => true, CURLOPT_TIMEOUT_MS => 100]);
$timedOut = curl_exec($ch) === false && curl_errno($ch) === CURLE_OPERATION_TIMEDOUT;
echo json_encode([$streamed, $aborted, $timedOut]);
