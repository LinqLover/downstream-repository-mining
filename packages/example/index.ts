#!/usr/bin/env -S npx ts-node

import { getCacheDirectory, Package, ReferenceSearcher } from 'dowdep'

const cacheDirectory = getCacheDirectory()
const $package = new Package({
    name: 'name',
    directory: 'directory'
})
console.log(cacheDirectory)
console.log($package)
console.log(ReferenceSearcher)
