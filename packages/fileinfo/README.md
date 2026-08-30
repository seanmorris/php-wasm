# php-wasm-fileinfo

fileinfo extension for php-wasm.

https://github.com/seanmorris/php-wasm

https://www.npmjs.com/package/php-wasm

## Usage

`php-wasm-fileinfo` can be loaded via dynamic imports:

```javascript
const php = new PhpWeb({sharedLibs: [
	await import('https://unpkg.com/php-wasm-fileinfo')
]});
```

You can rely on the default loading behavior if all `.so` files are served from the same directory as your `.wasm` files.

```javascript
const php = new PhpWeb({sharedLibs: ['php8.4-fileinfo.so']});
```

You can provide a callback as the `locateFile` option to map library names to URLs:

```javascript
const locateFile = (libName) => {
	return `https://my-example-server.site/path/to/libs/${libName}`;
};

const php = new PhpWeb({locateFile, sharedLibs: ['php8.4-fileinfo.so']});
```

## Build options:

The following options may be set in `.php-wasm-rc` for custom builds of `php-wasm` & `php-cgi-wasm`.

* WITH_FILEINFO

### WITH_FILEINFO

`0|static|dynamic`

When compiled as a `dynamic` extension, this will produce the extension `php-8.x-fileinfo.so`.
