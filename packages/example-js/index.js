#!/usr/bin/env -S npx node

const dowdep = require('dowdep')

const $package = new dowdep.Package(
    'name',
    '/path/to/directory'
)
console.log($package)
console.log(new dowdep.Dowdep().createDependencySearchers($package))
console.log(dowdep.ReferenceSearcher)
