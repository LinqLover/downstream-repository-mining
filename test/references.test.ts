import asyncIteratorToArray from 'it-all'
import _ from 'lodash'

import { ReferenceSearcher } from '../src/references'
import ifCurtailed from '../src/utils/if-curtailed'
import { printDiff } from './_utils/printDiff'

import expectedHeuristicReferences from './references.test/expectedReferences-heuristic.json'


describe('ReferenceSearcher', () => {
    it.each(_.flatMap(Object.entries(<{
        [packageReferenceSearcher: string]: {
            [packageName: string]: {
                [memberName: string]: {
                    [dependent: string]: {
                        [fileName: string]: number[]
                    }
                }
            }
        }
    }>{'heuristic': expectedHeuristicReferences}),
    ([packageReferenceSearcher, allExpectedReferences]) => _.map(Object.entries(allExpectedReferences), ([packageName, expectedReferences]) => ({ packageReferenceSearcher, packageName, expectedReferences })))
    )("should find relevant references for %s", async (
        { packageReferenceSearcher, packageName, expectedReferences }) => {
        const searcher = new ReferenceSearcher(packageName, 'test/references.test/examples/dependents')
        const references = await asyncIteratorToArray(searcher.searchReferences())

        /** Since null and undefined are invalid keys in JS objects, we stringify them for compatibility with lodash. See Reference.memberName. */
        function stringify(key: string | null | undefined) {
            if (key === undefined) return '<undefined>'
            if (key === null) return '<null>'
            return key
        }
        const aggregatedReferences = _.chain(references)
            .groupBy(reference => stringify(reference.memberName))
            .mapValues(memberReferences => _.chain(memberReferences)
                .groupBy(reference => reference.dependentName)
                .mapValues(dependentReferences => _.chain(dependentReferences)
                    .groupBy(reference => reference.file)
                    .mapValues(fileReferences => _.map(
                        fileReferences, reference => reference.lineNumber))
                    .value())
                .value())
            .value()

        const aggregatedExpectedReferences = expect.objectContaining(
            _.mapValues(expectedReferences, dependentReferences => expect.objectContaining(
                _.mapValues(dependentReferences, memberReferences => expect.objectContaining(
                    _.mapValues(memberReferences, lineNumbers => expect.arrayContaining(lineNumbers))
                ))
            )))
        ifCurtailed(
            () => expect(aggregatedReferences).toEqual(aggregatedExpectedReferences),
            () => printDiff(aggregatedReferences, aggregatedExpectedReferences, packageReferenceSearcher, packageName))
        // TODO: Test false positive rate
    })
})
