# php-wasm-xml

xml extenstion for php-wasm.

https://github.com/seanmorris/php-wasm

https://www.npmjs.com/package/php-wasm

## Usage

`php-wasm-xml` can be loaded via dynamic imports:

```javascript
const php = new PhpWeb({sharedLibs: [
    await import('https://unpkg.com/php-wasm-xml')
]});
```

You can rely on the default loading behavior if all `.so` files are served from the same directory as your `.wasm` files.

```javascript
const php = new PhpWeb({sharedLibs: ['php8.3-xml.so']});
```

You can provide a callback as the `locateFile` option to map library names to URLs:

```javascript
const locateFile = (libName) => {
    return `https://my-example-server.site/path/to/libs/${libName}`;
};

const php = new PhpWeb({locateFile, sharedLibs: ['php8.3-xml.so']});
```

## Build options:

The following options may be set in `.php-wasm-rc` for custom builds of `php-wasm` & `php-cgi-wasm`.

* WITH_XML

### WITH_XML

`0|static|shared`

When compiled as a `dynamic` extension, this will produce the extension `php-8.𝑥-xml.so`.
