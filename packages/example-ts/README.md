# dowdep-example

Not a real package.
This is only used to a) demonstrate and b) verify the way [`dowdep-core`](../core) is referenced in companion packages.
Since the structure of this repository is a bit unusual - it is a monorepo consisting of multiple node modules, we are using `ts-node` across the repository, and an intransparent build step before executing one of the UI packages is avoided -, this has revealed as a surprisingly counter-intuitive challenge.
For this reason, this package even has its own [CI](/.github/workflows/example.test.yml).
