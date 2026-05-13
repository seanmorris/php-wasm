---
pagetitle: Php-Cgi-Wasm Methods
itemtype: schema.org/Class
microdata:
    name: PhpCgiWasm
    alternateName: PhpCgiWeb
    alternateName: PhpCgiWebview
    alternateName: PhpCgiNode
    alternateName: PhpCgiWorker
---
<!--
Vendored from php-wasm-site commit 73d20fb6d1c1dce8519354e821761f60df4c220c
Source: https://github.com/seanmorris/php-wasm-site/blob/73d20fb6d1c1dce8519354e821761f60df4c220c/pages/methods/php-cgi-wasm.md
Validation refs:
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/test/docs/report.mjs
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpCgiBase.js
- https://github.com/seanmorris/php-wasm/blob/a8b1c8953c98c72811e0e4dadd1c95af38a94754/source/PhpCgiNode.js
-->
# Php-Cgi-Wasm Methods

## constructor

The php-cgi-wasm constructor takes an options bucket object as its single parameter. The keys are outlined below.

```javascript
const php = new PhpCgiWorker();
```

The concrete classes are:

- `PhpCgiWeb`
- `PhpCgiWebview`
- `PhpCgiNode`
- `PhpCgiWorker`

### version

*string*

Selects the PHP-CGI runtime version to load.

```javascript
const php = new PhpCgiWorker({version: '8.4'});
```

### sharedLibs

*array of strings or objects*

```javascript
const php = new PhpCgiWorker({
    sharedLibs: [
        { url: 'https://unpkg.com/php-wasm-sqlite/php8.4-sqlite.so', ini: true  },
        { url: 'https://unpkg.com/php-wasm-sqlite/sqlite.so',        ini: false },
    ]
});
```

### dynamicLibs

*array of strings or objects*

Resolved like `sharedLibs`, but never written into `php.ini`.

### files

*array of objects*

Dynamic and shared `intl` builds use this mechanism to provide `icudt72l.dat` under `/preload`. Static `intl` builds can bundle the same file into the runtime `.data` package instead.

```javascript
const php = new PhpCgiWorker({
    files: [
        {
            name: 'icudt72l.dat',
            parent: '/preload/',
            url: 'https://unpkg.com/php-wasm-intl/icudt72l.dat'
        }
    ]
});
```

### actions

*object<string, function>*

Extra message-bus actions exposed through `php.handleMessageEvent`. Action handlers receive the PHP wrapper as their first argument.

```javascript
const php = new PhpCgiWorker({
    actions: {
        helloWorld: (php, name) => {
            return `Hello, ${name}!`;
        },
    }
});
```

### locateFile

*function*

```javascript
const php = new PhpCgiWorker({
    locateFile: path => `/assets/php/${path}`
});
```

### docroot

*string*

Tells php where to find the php source files for your website inside the emscripten filesystem.

```javascript
const php = new PhpCgiWorker({
    docroot: '/persist/public'
});
```

### entrypoint

*string*

```javascript
const php = new PhpCgiWorker({
    entrypoint: 'index.php'
});
```

### prefix

*string*

If a request is made with a pathname that starts with `prefix`, php-cgi-wasm will activate and attempt to route the request to PHP rather than allowing it to proceed to the network.

```javascript
const php = new PhpCgiWorker({
    prefix: '/php-wasm'
});
```

### exclude

*array of strings*

If a request matched the prefix, but the URL also matches an element of `exclude`, then PHP will ignore the request and it will be sent to the network.

```javascript
const php = new PhpCgiWorker({
    exclude: ['/php-wasm/assets', '/php-wasm/static']
});
```

### rewrite

*function(string): string | {scriptName: string, path: string}*

Pass a function that will receive paths and rewrite them before PHP begins routing.

```javascript
const php = new PhpCgiWorker({
    rewrite: path => path === '/php-wasm' ? '/php-wasm/index.php' : path
});
```

### types

*object.<string, string>*

```javascript
const php = new PhpCgiWorker({
    types: {
        svg: 'image/svg+xml',
        webp: 'image/webp'
    }
});
```

### notFound

*function(request): response*

This callback will be called when the requested PHP script/static asset is not found, and should return a `Response` object.

```javascript
const php = new PhpCgiWorker({
    notFound: request => new Response('404 - Not Found', {status: 404})
});
```

### onRequest

*function(request, response): void*

Callback to run for every request.

```javascript
const php = new PhpCgiWorker({
    onRequest: (request, response) => {
        console.log(request.url, response.status);
    }
});
```

### env

*object<string, string>*

Environment variables to inject into the CGI runtime before each request.

```javascript
const php = new PhpCgiWorker({
    env: {
        APP_ENV: 'development',
        APP_DEBUG: '1'
    }
});
```

### autoTransaction

*boolean*

Defaults to `true`. Controls whether request handling and filesystem operations automatically wrap themselves in filesystem transactions.

### maxRequestAge

*number*

Maximum request age in milliseconds. Older requests return `408`.

### staticCacheTime

*number*

How long static-file responses may be cached in browsers with the Cache API available.

### dynamicCacheTime

*number*

Stored setting for dynamic response cache lifetime.

### vHosts

*array of objects*

Mount multiple PHP applications under different path prefixes.

```javascript
const php = new PhpCgiWorker({
    vHosts: [
        {
            pathPrefix: '/php-wasm/app-a',
            directory: '/persist/app-a/public',
            entrypoint: 'index.php'
        }
    ]
});
```

## handleInstallEvent

In service workers, this hooks into the `install` event. This should be set up as follows:

```javascript
self.addEventListener('install', event => php.handleInstallEvent(event));
```

In service workers, this hooks into the `activate` event. This should be set up as follows:

## handleActivateEvent

```javascript
self.addEventListener('activate', event => php.handleActivateEvent(event));
```

In service workers, this hooks into the `message` event. This should be set up as follows:

## handleMessageEvent

```javascript
self.addEventListener('message', event => php.handleMessageEvent(event));
```

`handleMessageEvent` exposes the built-in filesystem and settings methods over the worker message channel:

- `analyzePath`
- `readdir`
- `readFile`
- `stat`
- `mkdir`
- `rmdir`
- `writeFile`
- `rename`
- `unlink`
- `putEnv`
- `refresh`
- `getSettings`
- `setSettings`
- `getEnvs`
- `setEnvs`
- `storeInit`

It will also dispatch any custom handlers provided via the `actions` constructor option.

In service workers, this hooks into the `fetch` event, and will call the `request` method in service workers.

This should be set up as follows:

## handleFetchEvent

```javascript
self.addEventListener('fetch', event => php.handleFetchEvent(event));
```

## request

The `request` method only needs to be called manually if PHP-CGI is running under Node.js or inside a webpage. When running in a service worker, `handleFetchEvent` will call `request` internally.

It returns a `Response`.

## refresh

This will discard the current PHP instance and spin up a brand new one.

## Filesystem and Settings Helpers

`PhpCgiBase` also exposes:

- `analyzePath(path)`
- `readdir(path)`
- `readFile(path, options)`
- `stat(path)`
- `mkdir(path)`
- `rmdir(path)`
- `rename(path, newPath)`
- `writeFile(path, data, options)`
- `unlink(path)`
- `putEnv(name, value)`
- `getSettings()`
- `setSettings(settings)`
- `getEnvs()`
- `setEnvs(env)`
- `storeInit()`
