import _ from 'lodash'
import asyncIteratorToArray from 'it-all'
import * as path from 'path'
import readJson from 'read-package-json'
import rimRaf from 'rimraf'

import { getNpmDeps, downloadDep, searchReferences, Dependent } from "../src/npm-deps";


describe('getNpmDeps', () => {
    it.each`
        packageName     | limit  | countNestedDeps  | downloadGitHubData  | timeoutSecs  | nonGitHubThreshold
        ${'glob'}       | ${3}   | ${false}         | ${false}            | ${10}        | ${null}
        ${'glob'}       | ${3}   | ${false}         | ${true}             | ${10}        | ${0}
        ${'glob'}       | ${3}   | ${true}          | ${true}             | ${30}        | ${0}
        ${'gl-matrix'}  | ${4}   | ${false}         | ${false}            | ${30}        | ${null}
    `("should return plausible results for $packageName (at least $limit deps)", async ({
            packageName, limit, countNestedDeps, downloadGitHubData, timeoutSecs, nonGitHubThreshold}) => {
        jest.setTimeout(timeoutSecs * 1000)

        const deps = <Dependent[]>await getNpmDeps(packageName, limit, countNestedDeps, downloadGitHubData)

        // NOTE: FLAKE TEST (at least 2 incidences).
        // Raised the glob limit to 3, did this solve the issue?
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
            const github = dep!.github
            if (!dep.github) continue

            expect(github!.name).toBeTruthy()
            expect(github!.owner).toBeTruthy()
            expect(github!.stargazerCount).toBeGreaterThanOrEqual(10)
            expect(github!.forkCount).toBeGreaterThanOrEqual(10)
        }
    })
})

describe('downloadDep', () => {
    it.each`
        packageName     | version     | tarballUrl
        ${'gl-matrix'}  | ${'3.3.0'}  | ${'https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.3.0.tgz'}
        ${'gl-matrix'}  | ${'3.2.1'}  | ${'https://registry.npmjs.org/gl-matrix/-/gl-matrix-3.2.1.tgz'}
    `("should fetch the package '$packageName' with the right version '$version'", async ({
            packageName, version, tarballUrl}) => {
        beforeEach(() => {
            rimRaf(<string>process.env.NPM_CACHE, (error: any) => {if (error) throw error})
        });

        jest.setTimeout(5000)

        const dep = new Dependent()
        dep.name = packageName
        dep.tarballUrl = tarballUrl

        await downloadDep(dep)

        readJson(path.join(<string>process.env.NPM_CACHE, packageName, 'package.json'), console.error, false, (error: any, data: any) => {
            expect(error).toBeFalsy()

            expect(data.version).toBe(version)
        })
    })
})

describe('searchReferences', () => {
    it.each`
        packageName   | expectedReferences
        ${'heureka'}  | ${{'bar': {'index.js': [1, 4, 7]}, 'foo': {'index.ts': [1, 5, 8, 9], 'util.js': [1, 3]}}}
        ${'jolo'}     | ${{'foo': {'index.ts': [2, 4, 7]}}}
    `("should find relevant references for package '$packageName'", async ({
            packageName, expectedReferences}) => {
        const references = await asyncIteratorToArray(searchReferences(packageName, undefined, 'test/npm-deps.test/examples'))

        const aggregatedReferences = _.chain(references)
            .groupBy(reference => reference.dependent.name)
            .mapValues(dependentReferences => _.chain(dependentReferences)
                .groupBy(reference => reference.file)
                .mapValues(fileReferences => _.map(
                    fileReferences, reference => reference.lineNumber))
                .value())
            .value()

        expect(aggregatedReferences).toEqual(expectedReferences)
    })
})
