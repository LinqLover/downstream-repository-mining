# dowdep-cli

A simple command-line interface for [dowdep](../core) built using `oclif`.
Outputs are in a machine-readable format and can be reused by other applications.

## Installation 

```sh
$ yarn install
$ npm link

# Install autocompletion (optional)
$ dowdep-cli autocomplete
```

## Usage

Required environment variables:

- **`GITHUB_OAUTH_TOKEN`:** The token that is used to retrieve additional information about downstream dependencies from GitHub.
  You can generate a new token in your [developer settings](https://github.com/settings/tokens/new).
- **`SOURCEGRAPH_TOKEN`:** The token that is used to search dependencies from [Sourcegraph](https://sourcegraph.com/about).
  You can generate a new token in your [account settings](https://sourcegraph.com/user/settings/tokens).
- **`NPM_CACHE`** *(optional)*: Indicates the path to the downloaded dependencies.

Find downstream dependencies of a package:

```sh
dowdep-cli list <your-package> [--limit=<number>] [--strategies=npm|sourcegraph|all]
```

Download downstream dependencies:

```sh
NPM_CACHE=<path/to/cache> dowdep-cli download <your-package> [--limit=<number>] [--strategies=npm|sourcegraph|all]
```

Search downloaded dependencies for references to package:

```sh
NPM_CACHE=<path/to/cache> dowdep-cli search <your-package> [--limit=<number>]
```

Show complete help:

```sh
dowdep-cli help [<command>]
```
