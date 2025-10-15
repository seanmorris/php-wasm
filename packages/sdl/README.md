# php-wasm-sdl

sdl extension for php-wasm

https://github.com/seanmorris/php-wasm

https://www.npmjs.com/package/php-wasm

## Usage

`php-wasm-sdl` can be loaded via dynamic imports:

```javascript
const php = new PhpWeb({sharedLibs: [
    await import('https://unpkg.com/php-wasm-sdl')
]});
```

```javascript
const php = new PhpWeb({sharedLibs: ['php8.3-sdl.so']});
```

You can provide a callback as the `locateFile` option to map library names to URLs:

```javascript
const locateFile = (libName) => {
    return `https://my-example-server.site/path/to/libs/${libName}`;
};

const php = new PhpWeb({locateFile, sharedLibs: ['php8.3-sdl.so']});
```

## Build options:

The following options may be set in `.php-wasm-rc` for custom builds of `php-wasm` & `php-cgi-wasm`.

* WITH_SDL

### WITH_SDL

`0|static`

When compiled as a `dynamic` extension, this will produce the extension `php-8.𝑥-sdl.so`.
