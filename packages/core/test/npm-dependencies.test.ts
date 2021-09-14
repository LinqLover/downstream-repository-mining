import assert from 'assert'
import { FullMetadata as PackageJson } from 'package-json'
import * as path from 'path'
import readPackageJsonCallback from 'read-package-json'
import rimRaf from 'rimraf'
import { promisify } from 'util'
import { Package } from '../src'
import { NpmDependency } from '../src/npm-dependencies'

import { Dowdep, getCacheDirectory } from '../src'

const readPackageJson = <(file: string) => Promise<PackageJson>><unknown>  // BUG in type definitions: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/33340
    promisify(readPackageJsonCallback)


// TODO: Extract all fixtures into separate files?
describe('updateDependencies', () => {
    it.each`
        packageName     | limit  | downloadGitHubData  | timeoutSecs  | nonGitHubThreshold
        ${'glob'}       | ${4}   | ${false}            | ${ 60}       | ${null}
        ${'glob'}       | ${4}   | ${true}             | ${120}       | ${0}
        ${'gl-matrix'}  | ${4}   | ${false}            | ${ 60}       | ${null}
        `("should return plausible results for $packageName (at least $limit deps)", async (
        { packageName, limit, downloadGitHubData, timeoutSecs, nonGitHubThreshold }: {
            packageName: string, limit: number, downloadGitHubData: boolean, timeoutSecs: number, nonGitHubThreshold: number | undefined
        }) => {
        jest.setTimeout(timeoutSecs * 1000)

        const dowdep = new Dowdep({
            dependencyLimit: limit,
            githubAccessToken: downloadGitHubData && process.env.GITHUB_OAUTH_TOKEN || undefined
        })
        const $package = new Package(packageName, undefined)
        await $package.updateDependencies(dowdep)

        expect($package.dependencies).toHaveLength(limit)

        for (const dep of $package.dependencies) {
            expect(dep.name).toBeTruthy()
        }

        if (nonGitHubThreshold) {
            expect($package.dependencies.filter(dep => !dep.githubRepository).length).toBeGreaterThanOrEqual(nonGitHubThreshold)
        }

        for (const dep of $package.dependencies) {
            const github = dep.githubRepository
            if (!github) continue

            expect(github.name).toBeTruthy()
            expect(github.owner).toBeTruthy()
            if (downloadGitHubData) {
                expect(github.stargazerCount).toBeGreaterThanOrEqual(10)
                expect(github.forkCount).toBeGreaterThanOrEqual(10)
            }
        }
    }, 60000)
})

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

        const dep = new NpmDependency(packageName, <Package><unknown>undefined)
        dep.tarballUrl = tarballUrl

        const dowdep = new Dowdep({
            sourceCacheDirectory: getCacheDirectory()
        })
        await dep.updateSource(dowdep)

        const data = await readPackageJson(path.join(<string>process.env.NPM_CACHE, packageName, 'package.json'))
        expect(data.version).toBe(version)
    })
})
