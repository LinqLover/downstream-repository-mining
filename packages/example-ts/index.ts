#!/usr/bin/env -S npx ts-node

import { Dowdep, Package, ReferenceSearcher } from 'dowdep'

const $package = new Package(
    'name',
    '/path/to/directory'
)
console.log($package)
console.log(new Dowdep().createDependencySearchers($package))
console.log(ReferenceSearcher)
