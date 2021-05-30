import { FullMetadata as PackageJson } from 'package-json'
import * as path from 'path'
import readJsonCallback from 'read-package-json'
import rimRaf from 'rimraf'
import { promisify } from 'util'

import { getNpmDeps, downloadDep, Dependent } from "../src/npm-deps"

const readJson = <(file: string) => Promise<PackageJson>><unknown>  // BUG in type definitions: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/33340
    promisify(readJsonCallback)


// TODO: Extract all fixtures into separate files?
describe('getNpmDeps', () => {
    it.each`
        packageName     | limit  | countNestedDeps  | downloadGitHubData  | timeoutSecs  | nonGitHubThreshold
        ${'glob'}       | ${4}   | ${false}         | ${false}            | ${10}        | ${null}
        ${'glob'}       | ${4}   | ${false}         | ${true}             | ${10}        | ${0}
        ${'glob'}       | ${4}   | ${true}          | ${true}             | ${30}        | ${0}
        ${'gl-matrix'}  | ${4}   | ${false}         | ${false}            | ${30}        | ${null}
        `("should return plausible results for $packageName (at least $limit deps)", async (
        { packageName, limit, countNestedDeps, downloadGitHubData, timeoutSecs, nonGitHubThreshold }: {
            packageName: string, limit: number, countNestedDeps: boolean, downloadGitHubData: boolean, timeoutSecs: number, nonGitHubThreshold: number | undefined
        }) => {
        jest.setTimeout(timeoutSecs * 1000)

        const deps = await getNpmDeps(packageName, limit, countNestedDeps, downloadGitHubData)

        // NOTE: FLAKE TEST (at least 4 incidences).
        // Raised the glob limit to 4, did this solve the issue?
        expect(deps).toHaveLength(limit)

        for (const dep of deps) {
            expect(dep.name).toBeTruthy()
            if (countNestedDeps) {
                expect(dep.dependentCount).toBeGreaterThanOrEqual(limit)
            }
        }

        if (nonGitHubThreshold) {
            expect(deps.filter(dep => !dep.github).length).toBeGreaterThanOrEqual(nonGitHubThreshold)
        }

        for (const dep of deps) {
            const github = dep.github
            if (!github) continue

            expect(github.name).toBeTruthy()
            expect(github.owner).toBeTruthy()
            expect(github.stargazerCount).toBeGreaterThanOrEqual(10)
            expect(github.forkCount).toBeGreaterThanOrEqual(10)
        }
    })
})

describe('downloadDep', () => {
    it.each`
        packageName     | version     | tarballUrl
        ${'gl-matrix'}  | ${'3.3.0'}  | ${'https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.3.0.tgz'}
        ${'gl-matrix'}  | ${'3.2.1'}  | ${'https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.2.1.tgz'}
    `("should fetch the package '$packageName' with the right version '$version'", async (
        { packageName, version, tarballUrl }: {
            packageName: string, version: string, tarballUrl: string
        }) => {
        await (promisify(rimRaf))(<string>process.env.NPM_CACHE)

        jest.setTimeout(5000)

        const dep = new Dependent()
        dep.name = packageName
        dep.tarballUrl = tarballUrl

        await downloadDep(dep)

        const data = await readJson(path.join(<string>process.env.NPM_CACHE, packageName, 'package.json'))
        expect(data.version).toBe(version)
    })
})
