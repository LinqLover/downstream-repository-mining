# Software Mining of Downstream Dependency Repositories

[![Test](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/test.yml/badge.svg)](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/test.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/linqlover/downstream-repository-mining/badge)](https://www.codefactor.io/repository/github/linqlover/downstream-repository-mining)

Mine usage information about your JavaScript/TypeScript package from dependent repositories.

For more information, read the [exposé](./docs/exposé.md):  
[![Exposé](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/expos%C3%A9.yml/badge.svg?branch=master)](https://github.com/LinqLover/downstream-repository-mining/actions/workflows/exposé.yml?query=branch%3Amaster)

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

## Acknowledgements

This is currently a student project for the course "Software Mining and Applications" offered by the Computer Graphics System Group ([@hpicgs](https://github.com/hpicgs)/[@varg-dev](https://github.com/varg-dev)) at the Hasso Plattner Institute (HPI), Potsdam, Germany.
Thanks to my supervisors, Daniel Limberger ([@cgcostume](https://github.com/cgcostume)) and Willy Scheibel ([@scheibel](https://github.com/scheibel))!
For further information, see [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md)).
