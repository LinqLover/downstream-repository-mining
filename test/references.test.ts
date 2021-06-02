import asyncIteratorToArray from 'it-all'
import _ from 'lodash'

import Package from '../src/package'
import { ReferenceSearcher } from '../src/references'
import ifCurtailed from '../src/utils/if-curtailed'
import { printDiff } from './_utils/printDiff'

import expectedHeuristicReferences from './references.test/expectedReferences-heuristic.json'
import expectedTypeReferences from './references.test/expectedReferences-types.json'


describe('ReferenceSearcher', () => {
    it.each(_.flatMap(Object.entries(<{
        [packageReferenceSearcher: string]: {
            [packageName: string]: {
                [category: string]: {
                    [memberName: string]: {
                        [dependent: string]: {
                            [fileName: string]: number[]
                        }
                    }
                }
            }
        }
    }>{'heuristic': expectedHeuristicReferences, 'types': expectedTypeReferences}),
    ([packageReferenceSearcher, allExpectedReferences]) => _.map(Object.entries(allExpectedReferences), ([packageName, expectedReferences]) => ({ packageReferenceSearcher, packageName, expectedReferences })))
    )("should find relevant references for %s", async (
        { packageReferenceSearcher, packageName, expectedReferences }) => {
        const _package = new Package(packageName)
        _package.directory = `test/references.test/examples/packages/${packageName}`
        const searcher = new ReferenceSearcher(_package, 'test/references.test/examples/dependents', packageReferenceSearcher)
        const references = await asyncIteratorToArray(searcher.searchReferences(true))

        /** Since null and undefined are invalid keys in JS objects, we stringify them for compatibility with lodash. See Reference.memberName. */
        function stringify(key: string | null | undefined) {
            if (key === undefined) return '<undefined>'
            if (key === null) return '<null>'
            return key
        }
        const aggregatedReferences = _.chain(references)
            .groupBy(reference => reference.isImport ? "imports" : "usages")
            .mapValues(categorizedReferences => _.chain(categorizedReferences)
                .groupBy(reference => stringify(reference.memberName))
                .mapValues(memberReferences => _.chain(memberReferences)
                    .groupBy(reference => reference.dependentName)
                    .mapValues(dependentReferences => _.chain(dependentReferences)
                        .groupBy(reference => reference.file)
                        .mapValues(fileReferences => _.map(
                            fileReferences, reference => reference.position.row))
                        .value())
                    .value())
                .value())
            .value()

        if (packageReferenceSearcher !== 'heuristic') {
            expect(aggregatedReferences).toEqual(expectedReferences)
        } else {
            // Tolerate false positives
            const aggregatedExpectedReferences = expect.objectContaining(
                _.mapValues(expectedReferences, categorizedReferences => expect.objectContaining(
                    _.mapValues(categorizedReferences, dependentReferences => expect.objectContaining(
                        _.mapValues(dependentReferences, memberReferences => expect.objectContaining(
                            _.mapValues(memberReferences, lineNumbers => expect.arrayContaining(lineNumbers))
                        ))
                    ))
                )))
            ifCurtailed(
                () => expect(aggregatedReferences).toEqual(aggregatedExpectedReferences),
                () => printDiff(aggregatedReferences, aggregatedExpectedReferences, packageReferenceSearcher, packageName))
        }
    })
})
