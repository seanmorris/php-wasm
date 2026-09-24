# CGI filesystem benchmark

Generated 2026-09-20T17:25:02.845Z. PHP 8.3.11, Emscripten 6.0.6, Chromium 147.0.7727.15.
Host: Intel(R) Core(TM) i7-7700K CPU @ 4.20GHz, 8 logical CPUs, 6.1.0-31-amd64. Fresh persistent browser profiles; warm requests bypass HTTP response caches.
Source: 44e06ef3791a7c1f442e4273b4d69b5ae4bb52c9. All timings are local; native compilation and compression run separately from measured trials.
Both builds use the same static extensions and full Asyncify with a 128 KiB stack. The candidate uses the single-threaded asynchronous OPFS backend in a CGI service worker.
The OPFS flush column is zero because its writes complete inside the CGI call. Their cost is included in response and restore timings.
Completed fresh-profile trials per framework/backend: 3. Warm requests per framework/backend: 60. Warm medians and p95 pool those requests; other timings are medians across complete trials.
The repeat driver alternates backend order between rounds and checks host CPU idle over three seconds and visible native-build containers before each trial. Idle thresholds used: 80%, 90%. Actual preflight idle range: 82.4–93.5%. This is not a guarantee of an idle host throughout each trial; observations are retained in host-idle.jsonl.
The first response follows archive extraction into fresh storage. Warm requests reuse that worker and filesystem; persisted restart creates a new worker/runtime while retaining the browser profile.

Rows include only complete trials with validated framework pages and successful persisted restarts. Failed trials remain in raw JSON and do not count as fast responses.

## Framework comparison

| Framework | IDBFS warm ms | OPFS warm ms | OPFS warm change | IDBFS restore s | OPFS restore s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Drupal 11.4.5 | 545.7 | 383.2 | -29.8% | 4.7 | 84.2 |
| WordPress 7.1 | 844.0 | 1580.0 | 87.2% | 2.1 | 70.1 |
| Laravel 11 | 510.5 | 922.3 | 80.7% | 2.7 | 71.9 |
| CakePHP 5 | 506.9 | 1545.5 | 204.9% | 2.5 | 43.5 |
| CodeIgniter 4 | 91.3 | 230.8 | 152.7% | 0.4 | 3.9 |
| Laminas 3 | 315.9 | 359.6 | 13.8% | 2.2 | 41.4 |

Negative warm change means a faster OPFS response. Restore excludes archive download and includes durable writes.

## Detailed timings

| Framework | FS | Complete / failed | Ready ms | Restore s | First ms | Warm median ms | Warm p95 ms | Flush ms | Static ms | Restart ready ms | Restart CGI ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Drupal 11.4.5 | idbfs | 3 / 0 | 590.8 | 4.7 | 4524.4 | 545.7 | 648.3 | 477.9 | 2.2 | 2576.5 | 1875.6 |
| Drupal 11.4.5 | opfs | 3 / 0 | 608.0 | 84.2 | 45811.9 | 383.2 | 459.2 | 0.0 | 3.2 | 492.3 | 780.1 |
| WordPress 7.1 | idbfs | 3 / 0 | 603.9 | 2.1 | 1512.4 | 844.0 | 897.5 | 101.2 | 2.6 | 1077.5 | 1634.3 |
| WordPress 7.1 | opfs | 3 / 0 | 631.3 | 70.1 | 2690.4 | 1580.0 | 1666.6 | 0.0 | 3.9 | 492.8 | 2395.4 |
| Laravel 11 | idbfs | 3 / 0 | 609.5 | 2.7 | 872.7 | 510.5 | 938.1 | 252.9 | 2.2 | 1576.1 | 1341.2 |
| Laravel 11 | opfs | 3 / 0 | 629.8 | 71.9 | 1285.2 | 922.3 | 1192.5 | 0.0 | 3.2 | 487.4 | 1568.4 |
| CakePHP 5 | idbfs | 3 / 0 | 648.2 | 2.5 | 978.3 | 506.9 | 606.9 | 297.9 | 2.4 | 1679.5 | 1623.9 |
| CakePHP 5 | opfs | 3 / 0 | 665.7 | 43.5 | 1464.0 | 1545.5 | 2049.4 | 0.0 | 3.4 | 508.3 | 3000.1 |
| CodeIgniter 4 | idbfs | 3 / 0 | 639.3 | 0.4 | 195.7 | 91.3 | 117.9 | 21.1 | 2.7 | 635.1 | 320.4 |
| CodeIgniter 4 | opfs | 3 / 0 | 683.3 | 3.9 | 355.7 | 230.8 | 311.0 | 0.0 | 3.4 | 526.2 | 487.9 |
| Laminas 3 | idbfs | 3 / 0 | 650.8 | 2.2 | 498.3 | 315.9 | 372.4 | 224.2 | 2.3 | 1477.9 | 934.4 |
| Laminas 3 | opfs | 3 / 0 | 660.9 | 41.4 | 539.3 | 359.6 | 453.3 | 0.0 | 3.3 | 529.6 | 747.5 |

## Persisted restart through first response

This includes both worker startup and the first framework response from retained storage. A faster worker-ready time alone does not establish a faster usable page.

| Framework | IDBFS ms | OPFS ms |
| --- | ---: | ---: |
| Drupal 11.4.5 | 4429.7 | 1278.1 |
| WordPress 7.1 | 2765.4 | 2888.2 |
| Laravel 11 | 2908.6 | 2055.8 |
| CakePHP 5 | 3329.7 | 3508.4 |
| CodeIgniter 4 | 955.5 | 1069.8 |
| Laminas 3 | 2355.4 | 1277.1 |

## Artifact sizes

| Backend | Artifact | Raw bytes | gzip -9 bytes | Brotli -11 bytes |
| --- | --- | ---: | ---: | ---: |
| idbfs | php.data | 30873664 | 12610294 | 7698896 |
| idbfs | php8.3-cgi-worker.mjs | 4404866 | 589862 | 418457 |
| idbfs | php8.3-cgi-worker.mjs.wasm | 40405624 | 11517480 | 7712991 |
| opfs | php.data | 30873664 | 12610294 | 7698896 |
| opfs | php8.3-cgi-worker.mjs | 4448377 | 586634 | 413846 |
| opfs | php8.3-cgi-worker.mjs.wasm | 40819220 | 11595371 | 7769364 |
| idbfs-pruned | php.data | 30873664 | 12610294 | 7698896 |
| idbfs-pruned | php8.3-cgi-worker.mjs | 4404866 | 589862 | 418457 |
| idbfs-pruned | php8.3-cgi-worker.mjs.wasm | 40333239 | 11499750 | 7706254 |
| idbfs | JavaScript + Wasm | 44810490 | 12107342 | 8131448 |
| opfs | JavaScript + Wasm | 45267597 | 12182005 | 8183210 |
| idbfs-pruned | JavaScript + Wasm | 44738105 | 12089612 | 8124711 |

## OPFS size changes

| Artifact | Raw change | gzip -9 change | Brotli -11 change |
| --- | ---: | ---: | ---: |
| php.data | +0 (+0.00%) | +0 (+0.00%) | +0 (+0.00%) |
| php8.3-cgi-worker.mjs | +43,511 (+0.99%) | -3,228 (-0.55%) | -4,611 (-1.10%) |
| php8.3-cgi-worker.mjs.wasm | +413,596 (+1.02%) | +77,891 (+0.68%) | +56,373 (+0.73%) |
| JavaScript + Wasm | +457,107 (+1.02%) | +74,663 (+0.62%) | +51,762 (+0.64%) |

The additional `idbfs-pruned` build uses the usual `zend_compile*,zend_add_literal*` Asyncify exclusions. It is a size reference; timing rows use the fully instrumented IDBFS control.

| JS + Wasm comparison | Raw change | gzip -9 change | Brotli -11 change |
| --- | ---: | ---: | ---: |
| Usual exclusions → OPFS with expanded Asyncify | +529,492 (+1.18%) | +92,393 (+0.76%) | +58,499 (+0.72%) |
