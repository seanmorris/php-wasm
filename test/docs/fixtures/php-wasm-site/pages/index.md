---
title: Php-Wasm by Sean Morris
description-meta: PHP in Browser, powered by WebAssembly. Deploy PHP 8 apps client-side in one click, run PHP in cloudflare with full access to D1 SQL, or write PHP desktop apps with GTK.
noprefix: true
template: templates/with-hero.php
hero: intro.html
leftBarLink: false
leftBarShow: false
canonical: https://php-wasm.seanmorr.is/
itemtype: schema.org/SoftwareSourceCode
microdata:
    name: php-wasm
    description: Php-Wasm is an implementation of PHP running in Web Assembly.
    alternateName: php-cgi-wasm
    programmingLanguage: php, javascript, webassembly
    runtimePlatform: webassembly
    codeRepository: https://github.com/seanmorris/php-wasm
    copyrightHolder: Sean Morris
    copyrightYear: 2020-2026
    countryOfOrigin: USA
    headline: PHP powered by WebAssembly.
    isAccessibleForFree: true
    isBasedOn: php
    isFamilyFriendly: true
    keywords: php, javascript, webassembly
    license: https://www.apache.org/licenses/LICENSE-2.0.txt
    maintainer: Sean Morris
    additionalType: https://schema.org/ComputerLanguage
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/index.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
<p class = "strong">Php Wasm puts PHP right in the browser.</p>
PHP can now run in the browser as a counterpart to Javascript, and can either be invoked from Javascript code or static HTML, where it's got full access to JS APIs as well as the DOM. Or, it can run a service worker, where it mimics a CGI webserver like Apache or nginx. And yea, it can serve whole websites.

<aside>
	<ul>
		<li>Embeds directly in HTML.</li>
		<li>Full Access to JS APIs.</li>
		<li>Runs in the browser, Node.js, and Cloudflare Workers.</li>
		<li>Supports a broad set of PHP extensions.</li>
	</ul>
	<p>Why even write Javascript anymore?</p>
</aside>

<p class = "strong">Standard PDO Database Connectors.</p>
Php Wasm supports SQLite, PostgreSQL, and Cloudflare D1, all via PDO, so you can query your database just like you've always done it.

<p class = "strong">A Full Bridge To Javascript Code</p>
The Vrzno extension allows PHP to gain access to any APIs available to Javascript. Objects, functions, and even classes can be imported from Javascript and used in PHP as if they were native code. That opens up things like DOM APIs, or anything else the browser exposes to Javascript. On the desktop, Node.js packages like NodeGTK can be used to build desktop applications in PHP.

You can see a simple demo of the Curvature framework being used to generate some dynamic html [here](https://seanmorris.github.io/php-wasm/?demo=curvature.php), or a node-based version that allows PHP to access GTK [here](https://github.com/seanmorris/php-gtk).

<aside class = "centered">
	<a target = "_blank" href = "https://drupal-cms-project-9c0022e0ec6f0d7d0acfffa4583f8606955183fe7716.pages.drupalcode.org/">
		<img alt = "Drupal Logo" class = "downstream-logo" src = "drupal-logo.svg" width = "144" height = "192" /></a>
	<p>
		<a target = "_blank" href = "https://drupal-cms-project-9c0022e0ec6f0d7d0acfffa4583f8606955183fe7716.pages.drupalcode.org/">Drupal Playground</a>
	</p>
	<a target = "_blank" href = "https://playground.wordpress.net/">
		<img alt = "WordPress Logo" class = "downstream-logo" src = "wordpress-logo.svg" width = "144" height = "192" />
	</a>
	<p>
		<a target = "_blank" href = "https://playground.wordpress.net/">WordPress Playground</a>
	</p>
</aside>

<p class = "strong">Field Tested.</p>

Php Wasm is already powering cutting-edge frontend PHP applications like WordPress-Playground, Drupal-Playground, and PlayWithLaravel. You can also find it featured on [3v4l.org](https://3v4l.org).

<p class = "strong">Fully Loaded with Batteries Included.</p>

Php Wasm comes with support for many of the most commonly used PHP extensions, including LibXML, OpenSSL, Intl, ICU, GD, mbstring + oniguruma, and zlib. Most of them can be loaded dynamically as shared objects, or compiled statically if your use case requires it. [View the whole list](/extensions/using-php-extensions.html#extension-list).

Extensions can even be loaded from a CDN like jsDelivr or unpkg, since they're wrapped in JS modules. You can learn how to do all that and more in the [docs](/extensions/using-php-extensions.html#dynamic-imports-for-extensions).

<p class = "strong">Isomorphic PHP.</p>

Write code that runs on the backend, the frontend, the edge and the service worker. You can even include classes directly from Packagist with a cloud-based autoloader.

<p class = "strong">And, of course, its Open Source.</p>

Php Wasm is published 100% for free under the Apache License, Version 2.0. This means Php Wasm is and always will be 100% free. Php Wasm is committed to maintaining the free and open nature of the web, and all the tools the project is based on.

<p class = "strong">Want to Reach Out?</p>

If you'd like to get involved and contribute code or sponsorship, head over to the [GitHub repo](https://github.com/seanmorris/php-wasm), and don't hesitate to say hi on [Discord](https://discord.com/invite/j8VZzju7gJ)!
