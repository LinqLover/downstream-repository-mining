# dowdep-cli

Command-line interface for [dowdep](../../) built using `oclif`.

## Installation 

```sh
$ yarn install
$ npm link

# Install autocompletion (optional)
$ dowdep autocomplete
```

## Usage

Find downstream dependencies of a package:

```sh
dowdep list <your-package> [--limit=<number>]
```

Download downstream dependencies:

```sh
NPM_CACHE=<path/to/cache> dowdep download <your-package> [--limit=<number>]
```

Search downloaded dependencies for references to package:

```sh
NPM_CACHE=<path/to/cache> dowdep search <your-package> [--limit=<number>]
```

Show help:

```sh
dowdep help [<command>]
```
