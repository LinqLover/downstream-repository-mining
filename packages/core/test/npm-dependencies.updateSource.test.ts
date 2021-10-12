import assert from 'assert'
import { FullMetadata as PackageJson } from 'package-json'
import * as path from 'path'
import readPackageJsonCallback from 'read-package-json'
import rimRaf from 'rimraf'
import { promisify } from 'util'
import { Package } from '../src'
import { NpmDependency } from '../src/dependencies/npm'

import { Dowdep, loadExternalModules } from '../src'

const readPackageJson = <(file: string) => Promise<PackageJson>><unknown>  // BUG in type definitions: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/33340
    promisify(readPackageJsonCallback)


describe('updateSource', () => {
    it.each`
        packageName     | version     | tarballUrl
        ${'gl-matrix'}  | ${'3.3.0'}  | ${'https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.3.0.tgz'}
        ${'gl-matrix'}  | ${'3.2.1'}  | ${'https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.2.1.tgz'}
    `("should fetch the package '$packageName' with the right version '$version'", async (
        { packageName, version, tarballUrl }: {
            packageName: string, version: string, tarballUrl: string
        }) => {
        jest.setTimeout(5000)
        assert(process.env.NPM_CACHE)
        await (promisify(rimRaf))(process.env.NPM_CACHE)

        await loadExternalModules()

        const dep = new NpmDependency(packageName, <Package><unknown>undefined)
        dep.tarballUrl = tarballUrl

        const dowdep = new Dowdep({
            sourceCacheDirectory: process.env.NPM_CACHE || 'cache'
        })
        await dep.updateSource(dowdep)

        const data = await readPackageJson(path.join(<string>process.env.NPM_CACHE, packageName, 'package.json'))
        expect(data.version).toBe(version)
    })
})
