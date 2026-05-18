# php-wasm-yaml

`php-wasm-yaml` provides the `yaml` extension for `php-wasm`.

## Install

```sh
npm install php-wasm php-wasm-yaml
```

## What It Loads

The package resolves the active runtime version to `php8.x-yaml.so` and bundles `libyaml.so`.

## Usage

```js
import { PhpWeb } from 'php-wasm/PhpWeb.mjs';
import yaml from 'php-wasm-yaml';

const php = new PhpWeb({
  version: '8.4',
  sharedLibs: [yaml],
});

await php.run(`<?php var_dump(extension_loaded('yaml'));`);
```

## Custom Builds

Enable `WITH_YAML` in `.php-wasm-rc`.

## Build Options

- `WITH_YAML`: defaults to `dynamic`. Allowed values: `0`, `1`, `static`, `shared`, `dynamic`.
