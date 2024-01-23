# [![seanmorris/php-wasm](https://github.com/seanmorris/php-wasm/blob/master/docs/sean-icon.png)](https://github.com/seanmorris/php-wasm) php-wasm
[![php-wasm](https://img.shields.io/npm/v/php-wasm?color=4f5d95&label=php-wasm&style=for-the-badge)](https://www.npmjs.com/package/php-wasm)
[![Apache-2.0 Licence Badge](https://img.shields.io/npm/l/cv3-inject?logo=apache&color=427819&style=for-the-badge)](https://github.com/seanmorris/php-wasm/blob/master/LICENSE) [![GitHub Sponsors](https://img.shields.io/github/sponsors/seanmorris?style=for-the-badge&color=f1e05a)](https://github.com/sponsors/seanmorris) ![Size](https://img.shields.io/github/languages/code-size/seanmorris/php-wasm?color=e34c26&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAABQAAAAOCAQAAACFzfR7AAABF0lEQVQoFQXBQWvOAQDA4ef/7o29YWtqKU7ExWE5OIvm4LKcnXwD7aQ0N/kAczO1i1KOO0xJvQojaTm4KbJabnJysLSf5wFAa603CUB322yOAAitVT86BTTQ1+oJDYDQcv+qFRr3vC1ooYPqDkHoYgfVKmnSfhG62t/qBkHn2q8ekjRpryB0v/rZ2eh4r6tpY5pp3Gx7RTONoJfVLnpQfekYtNG0832rRj3tEaT31bOxQ5wc/oATrnnniEMfXfaZDFrAoEk71XajNN9OVVW7HYVeVZ9AF/pd3YPm267qbYs0tF597wygpaquQ7Nt9QLoVlWXCEK3q1oCCF2p6iYBpKGN6kNzATrdr2qVAACa9rgRQKPetAnAf1jX/qSkN8aIAAAAAElFTkSuQmCC&style=for-the-badge) ![GitHub Repo stars](https://img.shields.io/github/stars/seanmorris/php-wasm?style=for-the-badge&label=GitHub%20Stars&link=https%3A%2F%2Fgithub.com%2Fseanmorris%2Fphp-wasm) [![CircleCI](https://img.shields.io/circleci/build/github/seanmorris/php-wasm?logo=circleci&logoColor=white&style=for-the-badge&token=12dae2d9c3cd5ac38bd81752b0751872c556282d)](https://circleci.com/gh/seanmorris/php-wasm/) ![NPM Downloads](https://img.shields.io/npm/dw/php-wasm?style=for-the-badge&color=C80&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2Fphp-wasm&label=npm%20installs) ![jsDelivr hits (npm)](https://img.shields.io/jsdelivr/npm/hw/php-wasm?style=for-the-badge&color=09D&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2Fphp-wasm&label=jsdelivr%20hits)


### v0.0.8 - Preparing for Lift-off

* Adding ESM & CDN Module support!
* Adding stdin
* Buffering stdout/stderr in JavaScript
* Fixing `<script type = "text/php">` support.
* Adding fetch support for `src` on above.
* Adding support for libzip, iconv, & html-tidy
* In-place builds.
* Conditional builds.
* Updating PHP to 8.2.11
* Building with Emscripten 3.1.43
* Modularizing dependencies.
* Pre-compressing assets.

[changelog](https://raw.githubusercontent.com/seanmorris/php-wasm/master/CHANGELOG.md)

## Examples

+ [Hello, World](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250Aecho%2520%2522Hello%252C%2520World%21%2522%253B%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [phpinfo()](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522html%2522%257D%250Aphpinfo%28%29%253B%250A&autorun=1&persist=0&single-expression=0&render-as=html)
+ [JavaScript Callbacks](https://seanmorris.github.io/php-wasm?render-as=text&autorun=1&persist=1&single-expression=0&code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Atrue%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524setup%2520%253D%2520%2524setup%2520%253F%253F%2520false%253B%250A%2524x%2520%253D%2520%2524x%2520%253F%253F%25200%253B%250A%250Avar_dump%28%2524x%29%253B%250A%250Aif%28%21%2524setup%29%250A%257B%250A%2520%2520%2520%2520%2524window%2520%253D%2520new%2520Vrzno%253B%250A%250A%2520%2520%2520%2520%2524f%2520%253D%2520%2524window-%253EphpFuncA%2520%253D%2520function%28%29%2520use%28%2526%2524x%252C%2520%2524window%29%2520%257B%250A%2520%2520%2520%2520%2520%2520%2520%2520%2524window-%253Ealert%28%27RAN%2520A%21%2520%27%2520.%2520%2524x%252B%252B%29%253B%250A%2520%2520%2520%2520%257D%253B%250A%2520%2520%2520%2520%250A%2520%2520%2520%2520%2524g%2520%253D%2520%2524window-%253EphpFuncB%2520%253D%2520function%28%29%2520use%28%2526%2524x%252C%2520%2524window%29%2520%257B%250A%2520%2520%2520%2520%2520%2520%2520%2520echo%2520%27%2524x%2520is%2520now%2520%27%2520.%2520%28%252B%252B%2524x%29%2520.%2520PHP_EOL%253B%250A%2520%2520%2520%2520%257D%253B%250A%2520%2520%2520%2520%250A%2520%2520%2520%2520%2524setup%2520%253D%2520true%253B%250A%2520%2520%2520%2520%250A%2520%2520%2520%2520echo%2520%2522Initialized.%255Cn%2522%253B%250A%257D%250A%250A%2524window-%253EphpFuncA%28%29%253B%250A%252F%252F%2520%2524window-%253EphpFuncB%28%29%253B%250A%250A%252F%252F%2520vrzno_eval%28%27window.phpFuncA%28%29%27%29%253B%250Avrzno_eval%28%27window.phpFuncB%28%29%27%29%253B%250A)
+ [Persistent Memory](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Atrue%252C%2520%2522single-expression%2522%253A%2520true%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%252F%252F%2520run%2520this%2520over%2520and%2520over%2520again%250A%2524c%2520%253D%25201%2520%252B%2520%28%2524c%2520%253F%253F%2520-1%29%253B%250A%250Aprint%2520%2524c%253B%250A&autorun=1&persist=1&single-expression=1&render-as=text)
+ [Access The DOM](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524oldTitle%2520%253D%2520NULL%253B%250A%2524newTitle%2520%253D%2520%27Changed%2540%27%2520.%2520date%28%27h%253Ai%253As%27%29%253B%250A%250A%252F%252F%2520Grab%2520the%2520current%2520title%250A%2524oldTitle%2520%253D%2520vrzno_eval%28%27document.title%27%29%253B%250A%250A%252F%252F%2520Change%2520the%2520document%2520title%250A%2524newTitle%2520%253D%2520vrzno_eval%28%27document.title%2520%253D%2520%2522%27%2520.%2520%2524newTitle%2520.%2520%27%2522%27%2520%29%253B%250A%250Aprintf%28%250A%2509%27Title%2520changed%2520from%2520%2522%2525s%2522%2520to%2520%2522%2525s%2522.%27%250A%2509%252C%2520%2524oldTitle%250A%2509%252C%2520%2524newTitle%250A%29%253B%250A%250A%250A%252F%252F%2520Show%2520an%2520alert%250Avrzno_run%28%27alert%27%252C%2520%255B%27Hello%252C%2520World%21%27%255D%29%253B%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [goto](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524x%2520%253D%2520false%253B%250A%250Aa%253A%250A%250Aif%28%21%2524x%29%250A%257B%250A%2509goto%2520b%253B%250A%257D%250A%250Aecho%2520%272.%2520Foo%27%2520.%2520PHP_EOL%253B%250A%250Agoto%2520c%253B%250A%250Ab%253A%250A%250Aecho%2520%271.%2520Bar%27%2520.%2520PHP_EOL%253B%250A%250Aif%28%21%2524x%29%250A%257B%250A%2509%2524x%2520%253D%2520true%253B%250A%2509goto%2520a%253B%250A%257D%250A%250Ac%253A%250Aecho%2520%273.%2520Baz%27%2520.%2520PHP_EOL%253B%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [Standard Output, Standard Error, & Return](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520true%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%252F%252F%2520Only%2520%2522single%2522%2520expressions%2520can%2520return%2520strings%2520directly%250A%252F%252F%2520So%2520wrap%2520the%2520commands%2520in%2520an%2520IFFE.%250A%250A%28function%28%29%2520%257B%250A%2509global%2520%2524persist%253B%250A%250A%2509fwrite%28fopen%28%27php%253A%252F%252Fstdout%27%252C%2520%27w%27%29%252C%2520%2522standard%2520output%21%255Cn%2522%29%253B%250A%2509fwrite%28fopen%28%27php%253A%252F%252Fstdout%27%252C%2520%27w%27%29%252C%2520sprintf%28%250A%2509%2509%2522Ran%2520%2525d%2520times%21%255Cn%2522%252C%2520%252B%252B%2524persist%250A%2509%29%29%253B%250A%2509fwrite%28fopen%28%27php%253A%252F%252Fstderr%27%252C%2520%27w%27%29%252C%2520%27standard%2520error%21%27%29%253B%250A%250A%2509return%2520%27return%2520value%27%253B%250A%257D%29%28%29%253B%250A&autorun=1&persist=1&single-expression=1&render-as=text)
+ [Sqlite](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524db%2520%253D%2520new%2520SQLite3%28%27people.db%27%29%253B%250A%2524db-%253Equery%28%27CREATE%2520TABLE%2520IF%2520NOT%2520EXISTS%2520people%2520%28%250A%2509id%2520INTEGER%2520PRIMARY%2520KEY%252C%250A%2520%2520%2520%2509name%2520TEXT%2520NOT%2520NULL%250A%29%253B%27%29%253B%250A%250Afor%28%2524i%2520%253D%25200%253B%2520%2524i%2520%253C%2520100%253B%2520%2524i%252B%252B%29%2520%257B%250A%250A%2509%2524weirdName%2520%253D%2520str_repeat%28chr%28%2524i%252B64%29%252C%252010%29%253B%250A%2509%2524insert%2520%2520%2520%2520%253D%2520%2524db-%253Eprepare%28%27INSERT%2520INTO%2520people%2520%28name%29%2520VALUES%28%253Aname%29%27%29%253B%250A%250A%2509%2524insert-%253EbindValue%28%27%253Aname%27%252C%2520%2524weirdName%252C%2520SQLITE3_TEXT%29%253B%250A%250A%2509%2524insert-%253Eexecute%28%29%253B%250A%257D%250A%250A%2524results%2520%253D%2520%2524db-%253Equery%28%27SELECT%2520*%2520FROM%2520people%27%29%253B%250A%250A%2524rows%2520%253D%2520%255B%255D%253B%250A%250Awhile%2520%28%2524row%2520%253D%2520%2524results-%253EfetchArray%28%29%29%2520%257B%250A%2520%2520%2520%2520var_dump%28%2524row%29%253B%250A%257D%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [Sqlite w/PDO](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524db%2520%253D%2520new%2520PDO%28%27sqlite%253Apeople.db%27%29%253B%250A%250A%2524db-%253Equery%28%27CREATE%2520TABLE%2520IF%2520NOT%2520EXISTS%2520people%2520%28%250A%2509id%2520INTEGER%2520PRIMARY%2520KEY%252C%250A%2520%2520%2520%2509name%2520TEXT%2520NOT%2520NULL%250A%29%253B%27%29%253B%250A%250Afor%28%2524i%2520%253D%25200%253B%2520%2524i%2520%253C%252010%253B%2520%2524i%252B%252B%29%2520%257B%250A%2509%2524weirdName%2520%253D%2520str_repeat%28chr%28%2524i%252B64%29%252C%252010%29%253B%250A%2509%2524insert%2520%2520%2520%2520%253D%2520%2524db-%253Eprepare%28%27INSERT%2520INTO%2520people%2520%28name%29%2520VALUES%28%253Aname%29%27%29%253B%250A%250A%2509%2524insert-%253EbindParam%28%27%253Aname%27%252C%2520%2524weirdName%252C%2520SQLITE3_TEXT%29%253B%250A%250A%2509%2524insert-%253Eexecute%28%29%253B%250A%257D%250A%250A%2524results%2520%253D%2520%2524db-%253Equery%28%27SELECT%2520*%2520FROM%2520people%27%29%253B%250A%250A%2524rows%2520%253D%2520%255B%255D%253B%250A%250Awhile%2520%28%2524row%2520%253D%2520%2524results-%253EfetchObject%28%29%29%2520%257B%250A%2520%2520%2520%2520print_r%28%2524row%29%253B%250A%257D%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [JSON](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524x%2520%253D%2520%255B%250A%2509%2522id%2522%2520%253D%253E%25201%250A%255D%253B%250A%250Avar_dump%28json_decode%28json_encode%28%2524x%29%29%29%253B%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [Closures](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250A%2524x%2520%253D%252010%253B%250A%250Afunction%2520run%28callable%2520%2524f%29%2520%257B%250A%2509%2524f%28%29%253B%250A%257D%250A%250Arun%28function%2520%28%29%2520use%2520%28%2526%2524x%29%2520%257B%250A%2509%2524x%2520%253D%25209%253B%250A%257D%29%253B%250A%250Avar_dump%28%2524x%29%253B%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [File access](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522html%2522%257D%250A%250A%2524it%2520%253D%2520new%2520RecursiveIteratorIterator%28new%2520RecursiveDirectoryIterator%28%2522.%2522%29%29%253B%250A%250Aforeach%2520%28%2524it%2520as%2520%2524name%2520%253D%253E%2520%2524entry%29%2520%257B%250A%2509echo%2520%2524name%2520.%2520%2522%253Cbr%252F%253E%2522%253B%250A%257D%250A&autorun=1&persist=0&single-expression=0&render-as=html)
+ [Zend/bench.php](https://seanmorris.github.io/php-wasm/?code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522text%2522%257D%250A%250Ainclude%28%2522%252Fpreload%252Fbench.php%2522%29%253B%250A&autorun=1&persist=0&single-expression=0&render-as=text)
+ [Drupal 7](https://seanmorris.github.io/php-wasm/?demo=drupal.php&render-as=html&autorun=1&persist=0&single-expression=0&code=%253C%253Fphp%2520%252F%252F%2520%257B%2522autorun%2522%253Atrue%252C%2520%2522persist%2522%253Afalse%252C%2520%2522single-expression%2522%253A%2520false%252C%2520%2522render-as%2522%253A%2520%2522html%2522%257D%250Aini_set%28%27session.save_path%27%252C%2520%27%252Fpersist%27%29%253B%250A%250A%2524stdErr%2520%253D%2520fopen%28%27php%253A%252F%252Fstderr%27%252C%2520%27w%27%29%253B%250A%2524errors%2520%253D%2520%255B%255D%253B%250A%250Aset_error_handler%28function%28...%2524args%29%2520use%28%2524stdErr%252C%2520%2526%2524errors%29%257B%250A%2509fwrite%28%2524stdErr%252C%2520print_r%28%2524args%252C1%29%29%253B%250A%257D%29%253B%250A%250A%2524docroot%2520%253D%2520%27%252Fpersist%252Fdrupal-7.95%27%253B%250A%2524path%2520%2520%2520%2520%253D%2520%27%252Fnode%27%253B%250A%2524script%2520%2520%253D%2520%27index.php%27%253B%250A%250Aif%28%21is_dir%28%2524docroot%29%29%250A%257B%250A%2520%2520%2520%2520%2524it%2520%253D%2520new%2520RecursiveIteratorIterator%28new%2520RecursiveDirectoryIterator%28%2522%252Fpreload%252Fdrupal-7.95%252F%2522%252C%2520FilesystemIterator%253A%253ASKIP_DOTS%29%29%253B%250A%2520%2520%2520%2520foreach%2520%28%2524it%2520as%2520%2524name%2520%253D%253E%2520%2524entry%29%250A%2520%2520%2520%2520%257B%250A%2520%2520%2520%2520%2520%2520%2520%2520if%28is_dir%28%2524name%29%29%2520continue%253B%250A%2520%2520%2520%2520%2520%2520%2520%2520%2524fromDir%2520%253D%2520dirname%28%2524name%29%253B%250A%2520%2520%2520%2520%2520%2520%2520%2520%2524toDir%2520%2520%253D%2520%27%252Fpersist%27%2520.%2520substr%28%2524fromDir%252C%25208%29%253B%250A%2520%2520%2520%2520%2520%2520%2520%2520%2524filename%2520%253D%2520basename%28%2524name%29%253B%250A%2520%2520%2520%2520%2509%2524pDirs%2520%253D%2520%255B%2524pDir%2520%253D%2520%2524toDir%255D%253B%250A%2520%2520%2520%2520%2509while%28%2524pDir%2520%21%253D%253D%2520dirname%28%2524pDir%29%29%2520%2524pDirs%255B%255D%2520%253D%2520%2524pDir%2520%253D%2520dirname%28%2524pDir%29%253B%250A%2520%2520%2520%2520%2509%2524pDirs%2520%253D%2520array_reverse%28%2524pDirs%29%253B%250A%2520%2520%2520%2520%2509foreach%28%2524pDirs%2520as%2520%2524pDir%29%2520if%28%21is_dir%28%2524pDir%29%29%2520mkdir%28%2524pDir%252C%25200777%29%253B%250A%2520%2520%2520%2520%2509file_put_contents%28%2524toDir%2520%2520.%2520%27%252F%27%2520.%2520%2524filename%252C%2520file_get_contents%28%2524fromDir%2520.%2520%27%252F%27%2520.%2520%2524filename%29%29%253B%250A%2520%2520%2520%2520%257D%250A%257D%250A%250A%2524_SERVER%255B%27REQUEST_URI%27%255D%2520%2520%2520%2520%2520%253D%2520%27%252Fphp-wasm%27%2520.%2520%2524docroot%2520.%2520%2524path%253B%250A%2524_SERVER%255B%27REMOTE_ADDR%27%255D%2520%2520%2520%2520%2520%253D%2520%27127.0.0.1%27%253B%250A%2524_SERVER%255B%27SERVER_NAME%27%255D%2520%2520%2520%2520%2520%253D%2520%27localhost%27%253B%250A%2524_SERVER%255B%27SERVER_PORT%27%255D%2520%2520%2520%2520%2520%253D%25203333%253B%250A%2524_SERVER%255B%27REQUEST_METHOD%27%255D%2520%2520%253D%2520%27GET%27%253B%250A%2524_SERVER%255B%27SCRIPT_FILENAME%27%255D%2520%253D%2520%2524docroot%2520.%2520%27%252F%27%2520.%2520%2524script%253B%250A%2524_SERVER%255B%27SCRIPT_NAME%27%255D%2520%2520%2520%2520%2520%253D%2520%2524docroot%2520.%2520%27%252F%27%2520.%2520%2524script%253B%250A%2524_SERVER%255B%27PHP_SELF%27%255D%2520%2520%2520%2520%2520%2520%2520%2520%253D%2520%2524docroot%2520.%2520%27%252F%27%2520.%2520%2524script%253B%250A%250Achdir%28%2524docroot%29%253B%250A%250Aif%28%21defined%28%27DRUPAL_ROOT%27%29%29%2520define%28%27DRUPAL_ROOT%27%252C%2520getcwd%28%29%29%253B%250A%250Arequire_once%2520DRUPAL_ROOT%2520.%2520%27%252Fincludes%252Fbootstrap.inc%27%253B%250Adrupal_bootstrap%28DRUPAL_BOOTSTRAP_FULL%29%253B%250Adrupal_session_start%28%29%253B%250A%250Afwrite%28%2524stdErr%252C%2520json_encode%28%255B%27session_id%27%2520%253D%253E%2520session_id%28%29%255D%29%2520.%2520%2522%255Cn%2522%29%253B%250A%250Aglobal%2520%2524user%253B%250A%250A%2524uid%2520%2520%2520%2520%2520%253D%25201%253B%250A%2524user%2520%2520%2520%2520%253D%2520user_load%28%2524uid%29%253B%250A%2524account%2520%253D%2520array%28%27uid%27%2520%253D%253E%2520%2524user-%253Euid%29%253B%250A%2524session_name%2520%253D%2520session_name%28%29%253B%250A%250Aif%28%21%2524_COOKIE%2520%257C%257C%2520%21%2524_COOKIE%255B%2524%2524session_name%255D%29%250A%257B%250A%2509user_login_submit%28array%28%29%252C%2520%2524account%29%253B%250A%257D%250A%250A%2524itemPath%2520%253D%2520%2524path%253B%250A%2524itemPath%2520%253D%2520preg_replace%28%27%252F%255E%255C%255C%252F%252F%27%252C%2520%27%27%252C%2520%2524path%29%253B%250A%250A%2524GLOBALS%255B%27base_path%27%255D%2520%253D%2520%27%252Fphp-wasm%27%2520.%2520%2524docroot%2520.%2520%27%252F%27%253B%250A%2524base_url%2520%253D%2520%27%252Fphp-wasm%27%2520.%2520%2524docroot%253B%250A%250A%2524_GET%255B%27q%27%255D%2520%253D%2520%2524itemPath%253B%250A%250Amenu_execute_active_handler%28%29%253B%250A%250Afwrite%28%2524stdErr%252C%2520json_encode%28%255B%27HEADERS%27%2520%253D%253Eheaders_list%28%29%255D%29%2520.%2520%2522%255Cn%2522%29%253B%250Afwrite%28%2524stdErr%252C%2520json_encode%28%255B%27COOKIE%27%2520%2520%253D%253E%2520%2524_COOKIE%255D%29%2520.%2520PHP_EOL%29%253B%250Afwrite%28%2524stdErr%252C%2520json_encode%28%255B%27errors%27%2520%2520%253D%253E%2520error_get_last%28%29%255D%29%2520.%2520%2522%255Cn%2522%29%253B%250A)

## Quickstart

### Inline PHP

Include the `php-tags.js` script from a CDN:

```html
<script async type = "text/javascript" src = "https://cdn.jsdelivr.net/npm/php-wasm/php-tags.mjs"></script>
```

And run some PHP right in the page!

```html
<script type = "text/php">
<?php phpinfo();
</script>
```

Inline php can use standard input, output and error with `data-` attributes. Just set the value of the attribute to a selector that will match that tag.

```html
<script async type = "text/javascript" src = "https://cdn.jsdelivr.net/npm/php-wasm/php-tags.mjs"></script>

<script id = "input" type = "text/plain">Hello, world!</script>

<script type = "text/php" data-stdin = "#input" data-stdout = "#output" data-stderr = "#error">
	<?php echo file_get_contents('php://stdin');
</script>

<div id = "output"></div>
<div id = "error"></div>
```

The `src` attribute can be used on `<script type = "text/php">` tags, as well as their input elements. For example:

```html
<html>
    <head>
        <script async type = "text/javascript" src = "https://cdn.jsdelivr.net/npm/php-wasm/php-tags.mjs"></script>
        <script id = "input" src = "/test-input.json" type = "text/json"></script>
        <script type = "text/php" src = "/test.php" data-stdin = "#input" data-stdout = "#output" data-stderr = "#error"></script>
    </head>
    <body>
        <div id = "output"></div>
        <div id = "error"></div>
    </body>
</html>
```

#### CDN

Any NPM-enabled CDN will work:

##### JSDelivr

```html
<script async type = "text/javascript" src = "https://cdn.jsdelivr.net/npm/php-wasm/php-tags.mjs"></script>
```

##### Unpkg

```html
<script async type = "text/javascript" src = "https://www.unpkg.com/php-wasm/php-tags.mjs"></script>
```

<!--
##### esm.sh
```html
<script async type = "text/javascript" src = "https://esm.sh/php-wasm/php-wasm/php-tags.mjs"></script>
``` -->

## Install & Use

Install with npm:

```sh
$ npm install php-wasm
```

Include the module in your preferred format:

### Common JS

```javascript
const { PhpWeb } = require('php-wasm/PhpWeb.js');
const php = new PhpWeb;
```

### ESM

```javascript
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
const php = new PhpWeb;
```

#### From a CDN:

***Note: This does not require npm.***

```javascript
const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');
const php = new PhpWeb;
```

#### Pre-Packaged Static Assets:

***You won't need to use this if you build in-place or use a CDN.***

The php-wasm package comes with pre-build binaries out of the box so you can get started quickly.

You'll need to add the following `postinstall` script entry to your package.json to ensure the static assets are available to your web application. Make sure to replace `public/` with the path to your public document root if necessary.

```json
{
  "scripts": {
    "postinstall": [
      "cp node_modules/php-wasm/php-web.* public/"
    ]
  },
}
```

If you're using a more advanced bundler, use the vendor's documentation to learn how to move the files matching the following pattern to your public directory:

```
./node_modules/php-wasm/php-web.*
```

### Running PHP & Taking Output

Add your output listeners:

```javascript
// Listen to STDOUT
php.addEventListener('output', (event) => {
	console.log(event.detail);
});

// Listen to STDERR
php.addEventListener('error', (event) => {
	console.log(event.detail);
});
```

Provide some input data on STDIN if you need to:

```javascript
php.inputString('This is a string of data provided on STDIN.');
```

Be sure to wait until your WASM is fully loaded, then run some PHP:

```javascript
php.addEventListener('ready', () => {
	php.run('<?php echo "Hello, world!";');
});
```

Get the result code of your script with `then()`:

```javascript
php.addEventListener('ready', () => {
	php.run('<?php echo "Hello, world!";').then(retVal => {
		// retVal contains the return code.
	});
});
```

### Building in-place

To use the the in-place builder, first install php-wasm globally:

***Requires docker, docker-compose & make.***

```sh
$ npm install -g php-wasm
```

Create the build environment (can be run from anywhere):

```sh
$ php-wasm image
```

Optionally clean up files from a previous build:

```sh
$ php-wasm clean
```

#### Build for web

Then navigate to the directory you want the files to be built in, and run `php-wasm build`

```sh
$ cd ~/my-project
$ php-wasm build
# php-wasm build web
#  "web" is the default here
```

#### Build for node

```sh
$ cd ~/my-project
$ php-wasm build node
```

#### ESM Modules:

Build ESM modules with:

```sh
$ php-wasm build web mjs
$ php-wasm build node mjs
```

This will build the following files in the current directory (or in `PHP_DIST_DIR`, *see below for more info.*)

```sh
# php-wasm build web
PhpWeb.js       # require this module in your scripts
php-web.js      # internal interface between WASM and JavaScript
php-web.wasm    # binary php-wasm

# php-wasm build node
PhpNode.js      # require this module in your scripts
php-node.js     # internal interface between WASM and JavaScript
php-node.wasm   # binary php-wasm

# php-wasm build web mjs
PhpWeb.mjs      # import this module in your scripts
php-web.mjs     # internal interface between WASM and JavaScript
php-web.wasm    # Binary php-wasm

# php-wasm build node mjs
PhpNode.mjs     # import this module in your scripts
php-node.mjs    # internal interface between WASM and JavaScript
php-node.wasm   # binary php-wasm
```

### Packaging files

Use the `PRELOAD_ASSETS` key in your `.php-wasm-rc` file to define a list of files and directories to include by default.

These files will be available under `/preload` in the final package.

#### .php-wasm-rc

You can also create a `.php-wasm-rc` file in this directory to customize the build.

```make
# Build to a directory other than the current one (absolute path)
PHP_DIST_DIR=~/my-project/public

# Space separated list of files/directories (absolute paths)
# to be included under the /preload directory in the final build.
PRELOAD_ASSETS=~/my-project/php-scripts ~/other-dir/example.php

# Memory to start the instance with, before growth
INITIAL_MEMORY=2048MB

# Build with assertions enabled
ASSERTIONS=0

# Select the optimization level
OPTIMIZATION=3

# Build with libXML
WITH_LIBXML=1

# Build with Tidy
WITH_TIDY=1

# Build with Iconv
WITH_ICONV=1

# Build with SQLite
WITH_SQLITE=1

# Build with VRZNO
WITH_VRZNO=1
```

### Persistent Memory

So long as `php.refresh()` is not called from JavaScript, the instance will maintain its own persistent memory.

```php
<?php
// Run this over and over again...
print ++$x;

```

## php-wasm started as a fork of oraoto/PIB...

https://github.com/oraoto/pib

## Licensed under the Apache License, Version 2.0

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

http://www.apache.org/licenses/LICENSE-2.0
