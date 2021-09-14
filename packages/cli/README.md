# dowdep-cli

Command-line interface for [dowdep](../../) built using `oclif`.

## Installation 

```sh
$ yarn install
$ npm link

# Install autocompletion (optional)
$ dowdep-cli autocomplete
```

## Usage

Find downstream dependencies of a package:

```sh
dowdep-cli list <your-package> [--limit=<number>]
```

Download downstream dependencies:

```sh
NPM_CACHE=<path/to/cache> dowdep-cli download <your-package> [--limit=<number>]
```

Search downloaded dependencies for references to package:

```sh
NPM_CACHE=<path/to/cache> dowdep-cli search <your-package> [--limit=<number>]
```

Show help:

```sh
dowdep-cli help [<command>]
```
