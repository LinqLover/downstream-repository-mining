#!/usr/bin/env -S npx ts-node

import Package from "core/src/core/package"
import { FilePosition } from "core/src/core/references"

const $package = new Package({
    name: 'name',
    directory: 'directory'
})
const position = new FilePosition({
    row: 42
})
console.log($package)
console.log(position)
