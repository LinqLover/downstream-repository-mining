# dowdep-core

Core logic of [dowdep](../../).
This is a TypeScript module that can be referenced as demonstrated in the [example](../example-js) [packages](../example-ts) alongside.

## Installation (stand-alone)

```bash
yarn install
yarn build
```

## Development

```bash
yarn watch
```

## Interactive testing

```bash
$ node
> dowdep = require('./out/index.js')
> 
> dow = new dow.Dowdep()
> pkg = new dowdep.Package('random-js')
> await pkg.updateDependencies(dow, { downloadSource: false })
> // ...
```
