#!/usr/bin/env -S npx node

const dowdep = require('dowdep')

const cacheDirectory = dowdep.getCacheDirectory()
const $package = new dowdep.Package({
    name: 'name',
    directory: 'directory'
})
console.log(cacheDirectory)
console.log($package)
console.log(dowdep.ReferenceSearcher)
