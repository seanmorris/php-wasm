---
title: PHP in Javascript
weight: -800
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/getting-started/php-in-js.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpNode.mjs
-->
# Php-Wasm in Javascript

## Running PHP & Taking Output

First, import the module and create an instance of  PHP:

```javascript
const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');
const php = new PhpWeb;
```

Add some event listeners to get ahold of the output:

```javascript
// Listen to STDOUT & STDERR
php.addEventListener('output', (event) => console.log(event.detail));
php.addEventListener('error',  (event) => console.log(event.detail));
```

Pass some data on STDIN if required:

```javascript
php.inputString('This is a string of data provided on STDIN.');
```

... then run some PHP!

```javascript
const exitCode = await php.run('<?php echo "Hello, world!";');
```

## Exporting PHP functions to Javascript

With Vrzno enabled, the `php.x՝...՝` [tagged template string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates) enables you to export almost any PHP value directly to Javascript. This includes arrays, object, and even functions:

```javascript
const phpStrtotime = await php.x`function($time) { return strtotime($time); }`;
const phpDate = await php.x`function($format, $time) { return date($format, $time); }`;

const formatTime = (format, time) => phpDate(format, phpStrtotime(time));
```

You can see this working live on CodePen:

<https://codepen.io/SeanMorris227/pen/gONmKqL?editors=1111>

```javascript
(async () => {
  const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');
  const php = new PhpWeb;
  const input  = document.querySelector('#date-input');
  const format = document.querySelector('#date-format');
  const output = document.querySelector('#date-output');

  // Return an actual PHP function to Javascript:
  const phpStrtotime = await php.x`function($time) { return strtotime($time); }`;
  const phpDate = await php.x`function($format, $time) { return date($format, $time); }`;

  const formatTime = (format, time) => phpDate(format, phpStrtotime(time));

  input.addEventListener('input', () => output.innerText = formatTime(format.value, input.value));
  format.addEventListener('input', () => output.innerText = formatTime(format.value, input.value));

  format.value = 'Y-m-d H:i:s';
  input.value = '8:00pm 2 days ago';

  output.innerText = formatTime(format.value, input.value);
})();
```

## Importing Javascript Values into PHP

The `php.x՝...՝` & `php.r՝...՝` functions allow for Javascript to be interpolated into PHP code with the  `${𝒆𝒙𝒑𝒓𝒆𝒔𝒔𝒊𝒐𝒏}` notation that Javascript `՝backtick՝` interpolation normally allows for. Any Javascript values can be interpolated, and PHP will treat them as normal, native objects.

You can see this working live on CodePen:

<https://codepen.io/SeanMorris227/pen/wvLJXEJ?editors=0011>

```{ .javascript highlight="10-12" }
(async () => {
  const { PhpWeb } = await import('https://cdn.jsdelivr.net/npm/php-wasm/PhpWeb.mjs');

  const php = new PhpWeb;

  const phpCallback = await php.x` function(){

    $phpString = "PHP String";

    $jsCallback = ${function() {
        return "JS String: " + window.prompt("Provide some input, please.");
    }};

    return sprintf("%s and %s", $phpString, $jsCallback());
  }`;

  document.write(phpCallback());

})();
```
