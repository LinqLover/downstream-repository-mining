#!/usr/bin/env -S npx ts-node

import Package from "core/src/core/package"

const $package = new Package({
    name: 'name',
    directory: 'directory'
})
console.log($package)
