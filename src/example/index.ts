#!/usr/bin/env ts-node

import Package from "../core/package"

const $package = new Package({
    name: 'name',
    directory: 'directory'
})
console.log($package)
