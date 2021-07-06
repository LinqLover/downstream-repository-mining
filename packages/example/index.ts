#!/usr/bin/env -S npx ts-node

import { Dependent } from "core/src/core/npm-deps"
import Package from "core/src/core/package"
import { FilePosition } from "core/src/core/references"

const dependent = new Dependent({
    name: 'foo',
    tarballUrl: 'https://example.com'
})
const $package = new Package({
    name: 'name',
    directory: 'directory'
})
const position = new FilePosition({
    row: 42
})
console.log(dependent)
console.log($package)
console.log(position)
