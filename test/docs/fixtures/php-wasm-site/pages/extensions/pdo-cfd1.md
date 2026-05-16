---
title: pdo-cfd1
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/extensions/pdo-cfd1.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# pdo-cfd1

*pdo driver for Cloudflare D1 & php-wasm*

<span class = "highlight">@todo:</span> Walkthrough on compiling php-wasm for Cloudflare.

pdo_cfd1 requires PHP 8.1+.

## Connect & Configure

Pass the D1 object into the runtime constructor as a key to the `cfd1` object to enable pdo_cfd1 support.

`cfd1:` will become available as a PDO driver:

```javascript
const phpOptions = {
    cfd1: { mainDb: event.env.mainDb }
};

await php.run(`<?php $pdo = new PDO('cfd1:mainDb');`);
```

You can check `phpinfo()` to make sure that the D1 object is detected. `Cloudflare D1 SQL module detected` will display "yes" when the object has been passed in correctly:

![](https://raw.githubusercontent.com/seanmorris/pdo-cfd1/refs/heads/master/phpinfo.png)

PDO can be used with D1 just like any other SQL server:

```javascript
const phpOptions = {
    cfd1: { mainDb: event.env.mainDb }
};

await php.run(`<?php
    $pdo = new PDO('cfd1:mainDb');
    $select = $pdo->prepare(
        'SELECT PageTitle, PageContent FROM WikiPages WHERE PageTitle = ?'
    );
    $select->execute([$pageTitle]);
    $page = $select->fetchObject();`
);
```

## Todo

* *Named replacement tokens* - Currently only positional tokens are supported.
* *Error handling* - Error handling is currently very rudimentary and does not propagate messages.

## Cloudflare D1

`pdo_cfd1` is powered by [Cloudflare D1](https://developers.cloudflare.com/d1/).

<https://developers.cloudflare.com/d1/>
