---
title: Home
pagetitle: Documentation Home
weight: -1000
---
<!--
Vendored from php-wasm-site commit 2ec67be087fe50a57fb296d730f597e0979b6732
Source: https://github.com/seanmorris/php-wasm-site/blob/2ec67be087fe50a57fb296d730f597e0979b6732/pages/getting-started/home.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
-->
# Home

[![Static Badge](https://img.shields.io/badge/reddit-always%20online-336699?style=for-the-badge&logo=reddit)](https://www.reddit.com/r/phpwasm/) [![Discord](https://img.shields.io/discord/1199824765666463835?style=for-the-badge&logo=discord&link=https%3A%2F%2Fdiscord.gg%2Fj8VZzju7gJ)](https://discord.gg/j8VZzju7gJ)

<span style = "font-size:larger">Join the community: [reddit](https://www.reddit.com/r/phpwasm/) | [discord](https://discord.gg/j8VZzju7gJ)</span>

Nightly builds are announced in the `#nightly-builds` channel on the `php-wasm` Discord server.

## Getting Started

To install php-wasm with npm, see [INSTALLING](/getting-started/install-and-include.html).

For instructions on using PHP inside of JS scripts, see [PHP In Javascript](/getting-started/php-in-js.html).

If you want to write pure frontend PHP and skip the JS entirely, see [PHP In Static HTML](/getting-started/php-in-static-html.html).

If you'd like to spin up a webserver right in your browser, see [PHP-CGI In Service Workers](/getting-started/cgi-service-worker.html).

If you'd like to serve websites with Node.js, see [PHP-CGI In Node.js](/getting-started/cgi-in-nodeJs.html).

To run PHP at the edge with Cloudflare Workers or Pages and D1, see [PHP in Cloudflare](/getting-started/php-in-cloudflare.html).

## Demo

<iframe class="video" src="https://www.youtube.com/embed/rQ-_KMgUtFg?si=mPylUsIqa1FTwSjP" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen>
</iframe>

## Nightly Builds

Find successful builds on `develop` in the
[Build Artifacts workflow](https://github.com/seanmorris/php-wasm/actions/workflows/build.yaml?query=branch%3Adevelop+conclusion%3Asuccess).
Choose a run and keep its matching JavaScript/Wasm assets together. The ordinary
matrix covers PHP 8.0–8.5 with static, shared, and dynamic libraries; Cloudflare
uses its dedicated package and profile. Nightly announcements are posted in
Discord's `#nightly-builds` channel.

For historical release notes, see the [CHANGELOG](/CHANGELOG.html).

## 🍻 Dual licensed under the Apache License, Version 2.0 and the GNU GPL, Version 2

php-wasm is dual licensed under the [Apache License, Version 2.0](/LICENSE.html) and the [GNU General Public License, Version 2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html); you may use it under the terms of either license.

Unless required by applicable law or agreed to in writing, software distributed under the Licenses is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licenses for the specific language governing permissions and limitations under the Licenses.
